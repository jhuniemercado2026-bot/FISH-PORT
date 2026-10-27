const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(
  readFileSync(path.join(__dirname, '../utils/serverClock.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;

function createClock() {
  const state = {
    elapsed: 1000, phone: Date.parse('2045-01-01T00:00:00Z'),
    server: Date.parse('2026-10-24T04:00:00Z'), requests: 0,
    offline: false, payload: null, fetchOverride: null,
  };
  class PhoneDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.phone])); }
    static now() { return state.phone; }
  }
  const exports = {};
  runInNewContext(source, {
    exports, Date: PhoneDate, Intl, AbortController, setTimeout, clearTimeout,
    performance: { now: () => state.elapsed },
    require: (name) => {
      assert.equal(name, '../api/axios');
      return { getApiBaseUrl: () => 'https://test.invalid/api', buildApiHeaders: () => ({ Accept: 'application/json' }) };
    },
    fetch: async (url, options) => {
      state.requests += 1;
      assert.match(url, /\/server-time\?request=/);
      if (state.fetchOverride) return state.fetchOverride(url, options);
      state.elapsed += 200;
      if (state.offline) throw new Error('Offline');
      return { ok: true, json: async () => state.payload ?? { timestamp_ms: state.server } };
    },
  });
  return { clock: exports, state };
}

test('requires a server sync instead of trusting an incorrect phone clock', async () => {
  const { clock, state } = createClock();
  assert.equal(clock.hasServerTime(), false);
  assert.equal(clock.getServerTimeMs(), null);
  assert.throws(() => clock.getServerNow(), /synchronize/);
  await clock.syncServerClock();
  assert.equal(clock.getServerTimeMs(), state.server + 100);
  assert.equal(clock.getServerNow().toISOString(), '2026-10-24T04:00:00.100Z');
});

test('phone clock changes cannot move synchronized time forward or backward', async () => {
  const { clock, state } = createClock();
  await clock.syncServerClock();
  state.elapsed += 5000;
  state.phone = Date.parse('1995-01-01T00:00:00Z');
  assert.equal(clock.getServerTimeMs(), state.server + 5100);
  state.elapsed += 1000;
  state.phone = Date.parse('2099-01-01T00:00:00Z');
  assert.equal(clock.getServerTimeMs(), state.server + 6100);
});

test('advances from the last server time while offline and recovers on reconnect', async () => {
  const { clock, state } = createClock();
  await clock.syncServerClock();
  state.offline = true;
  state.elapsed += 60000;
  assert.equal(await clock.syncServerClock(true), false);
  assert.equal(clock.hasServerTime(), true);
  assert.equal(clock.getServerTimeMs(), state.server + 60300);
  state.elapsed += 30000;
  assert.equal(clock.getServerTimeMs(), state.server + 90300);
  state.offline = false;
  state.server += 90000;
  assert.equal(await clock.syncServerClock(true), true);
  assert.equal(clock.getServerTimeMs(), state.server + 100);
});

test('does not initialize the clock from invalid or unavailable server responses', async () => {
  for (const payload of [{ timestamp_ms: '123' }, { timestamp_ms: -1 }, { timestamp_ms: Infinity }, {}]) {
    const { clock, state } = createClock();
    state.payload = payload;
    assert.equal(await clock.syncServerClock(), false);
    assert.equal(clock.hasServerTime(), false);
  }
  const { clock, state } = createClock();
  state.fetchOverride = async () => ({ ok: false });
  assert.equal(await clock.syncServerClock(), false);
  assert.equal(clock.hasServerTime(), false);
});

test('deduplicates concurrent syncs and refreshes subscribed screens after successful sync', async () => {
  const { clock, state } = createClock();
  let release;
  let updates = 0;
  const unsubscribe = clock.subscribeServerClock(() => { updates += 1; });
  state.fetchOverride = () => new Promise((resolve) => { release = resolve; });
  const first = clock.syncServerClock(true);
  const second = clock.syncServerClock(true);
  assert.equal(first, second);
  assert.equal(state.requests, 1);
  release({ ok: true, json: async () => ({ timestamp_ms: state.server }) });
  await first;
  assert.equal(updates, 1);
  assert.equal(clock.getServerClockVersion(), 1);
  assert.equal(await clock.syncServerClock(), true);
  assert.equal(state.requests, 1);
  unsubscribe();
  state.fetchOverride = null;
  await clock.syncServerClock(true);
  assert.equal(state.requests, 2);
  assert.equal(updates, 1);
});

test('uses the Manila calendar day and year at the UTC year boundary', async () => {
  const { clock, state } = createClock();
  state.server = Date.parse('2026-12-31T16:30:00Z');
  await clock.syncServerClock();
  const day = clock.getServerCalendarDate();
  assert.equal(day.getFullYear(), 2027);
  assert.equal(day.getMonth(), 0);
  assert.equal(day.getDate(), 1);
});

test('transaction locks use server time and unlock at the server deadline', () => {
  const storeSource = ts.transpileModule(
    readFileSync(path.join(__dirname, '../store/historyStore.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  let serverNow = null;
  let expire;
  let scheduledDelay;
  const exports = {};
  runInNewContext(storeSource, {
    exports, Date,
    setTimeout: (callback, delay) => { expire = callback; scheduledDelay = delay; return 1; },
    clearTimeout: () => {},
    require: (name) => {
      if (name === 'zustand') return require('zustand');
      assert.equal(name, '../utils/serverClock');
      return { getServerTimeMs: () => serverNow };
    },
  });
  const deadline = Date.parse('2026-10-24T10:00:00Z');
  const lock = { is_locked: true, unlock_at: new Date(deadline).toISOString(), remittance_id: 1 };
  assert.equal(exports.isTransactionLockActive(lock), true, 'Unknown time must not bypass a lock');
  serverNow = deadline - 60000;
  assert.equal(exports.isTransactionLockActive(lock), true);
  exports.useHistoryStore.getState().setTransactionLock(lock);
  assert.equal(scheduledDelay, 60100);
  serverNow = deadline + 100;
  expire();
  assert.equal(exports.isTransactionLockActive(lock), false);
  assert.equal(exports.useHistoryStore.getState().transactionLock, null);
});

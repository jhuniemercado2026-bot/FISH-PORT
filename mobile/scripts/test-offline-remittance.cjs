const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(name, mocks = {}, globals = {}) {
  const filename = path.join(__dirname, '..', 'utils', name + '.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: false },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (id) => {
    if (!(id in mocks)) throw new Error('Unexpected dependency: ' + id);
    return mocks[id];
  }, setTimeout, clearTimeout, AbortController, ...globals }, { filename });
  return exports;
}
const { buildOfflineRemittanceCollection: collection, getOfflineRemittanceLock } = load('offlineRemittance');
const date = '2026-10-25';
const draft = (type, payload, owner = 1) => ({
  type, payload, owner_user_id: owner, local_id: type, endpoint: '/' + type,
});

test('offline collections include only the selected day and owner, including visiting boat cash', () => {
  const result = collection({ date, userId: 1, drafts: [
    draft('tickets', { ticket_date: date, ticket_fee: 25 }),
    draft('tickets', { ticket_date: '2026-10-26', ticket_fee: 900 }),
    draft('tickets', { ticket_date: date, ticket_fee: 900 }, 2),
    draft('docking', { docking_date: date, boat_category: 'visiting', docking_fee: 30 }),
    draft('banyera', { transaction_date: date, boat_category: 'visiting', items: [{ subtotal: 45 }] }),
    draft('docking', { docking_date: date, boat_category: 'registered', docking_fee: 800 }),
  ] });
  assert.equal(result.amount, '100.00');
  assert.equal(result.breakdown.length, 3);
});

test('cached server collection is counted once alongside pending drafts', () => {
  const result = collection({ date, userId: 1,
    cached: { amount: '50', hasSubmittedRemittance: false, breakdown: [] },
    history: { tickets: [{ created_by: 1, ticket_date: date, ticket_fee: 50 }] },
    drafts: [draft('tickets', { ticket_date: date, ticket_fee: 25 })],
  });
  assert.equal(result.amount, '75.00');
});

test('history provides offline totals when no collection summary was cached', () => {
  assert.equal(collection({ date, userId: 1, drafts: [], history: {
    tickets: [{ created_by: 1, ticket_date: date, ticket_fee: 50 },
      { created_by: 1, ticket_date: date, ticket_fee: 60, voided_at: date }],
  } }).amount, '50.00');
});

test('an old zero collection cache does not hide newer saved collections', () => {
  assert.equal(collection({ date, userId: 1, drafts: [],
    cached: { amount: '0', hasSubmittedRemittance: false, breakdown: [] },
    history: { tickets: [{ ticket_id: 1, created_by: 1, ticket_date: date, ticket_fee: 75 }] },
  }).amount, '75.00');
});

test('recent synced transactions fill a stale zero even before history has refreshed', () => {
  const result = collection({ date, userId: 1,
    cached: { amount: '0', hasSubmittedRemittance: false, breakdown: [] },
    drafts: [{ ...draft('tickets', { ticket_date: date, ticket_fee: 75 }), local_id: 'local-ticket' }],
    history: { tickets: [{ ticket_id: 1, created_by: 1, ticket_date: date, ticket_fee: 75 }] },
    syncedTransactions: [{ type: 'tickets', local_id: 'local-ticket', data: {
      ticket: { ticket_id: 1, created_by: 1, ticket_date: date, ticket_fee: 75 },
    } }],
  });
  assert.equal(result.amount, '75.00');
  assert.equal(result.breakdown.length, 1);
});

test('older history cannot replace a fresh zero summary after collections were voided', () => {
  assert.equal(collection({ date, userId: 1, drafts: [],
    cached: { amount: '0', hasSubmittedRemittance: false, breakdown: [], saved_at: '2026-10-25T10:00:00Z' },
    historySavedAt: '2026-10-25T09:00:00Z',
    history: { tickets: [{ ticket_id: 1, created_by: 1, ticket_date: date, ticket_fee: 75 }] },
  }).amount, '0.00');
});

test('pending remittance prevents another remittance only for its owner and date', () => {
  const drafts = [draft('remittance', { date, amount: 25 })];
  assert.equal(collection({ date, userId: 1, drafts }).hasSubmittedRemittance, true);
  assert.equal(collection({ date, userId: 2, drafts }).hasSubmittedRemittance, false);
  assert.equal(collection({ date: '2026-10-26', userId: 1, drafts }).hasSubmittedRemittance, false);
});

test('submitted remittance clears both collection amount and breakdown on every restore path', () => {
  const ticket = { ticket_id: 1, created_by: 1, ticket_date: date, ticket_fee: 75 };
  const oldBreakdown = [{ transaction: 'Vehicle Ticket', type_name: 'Truck', cash_received: 75 }];
  const sources = [
    { cached: { amount: '75', hasSubmittedRemittance: true, breakdown: oldBreakdown } },
    { drafts: [draft('remittance', { date, amount: 75 })] },
    { history: { tickets: [ticket], remittance: [{ submitted_by: 1, date }] } },
    { syncedTransactions: [{ local_id: 'remittance-synced', type: 'remittance', data: {
      remittance: { remittance_id: 1, submitted_by: 1, date, amount: 75 },
    } }] },
  ];
  for (const source of sources) {
    const result = collection({ date, userId: 1, drafts: [],
      cached: { amount: '75', hasSubmittedRemittance: false, breakdown: oldBreakdown },
      history: { tickets: [ticket] }, ...source,
    });
    assert.equal(result.hasSubmittedRemittance, true);
    assert.equal(Number(result.amount), 0);
    assert.equal(result.breakdown.length, 0);
  }
  // Clearing Add Transaction must not erase the saved draft's historical detail.
  const savedDraft = draft('remittance', { date, amount: 75 });
  savedDraft.metadata = { breakdown: oldBreakdown };
  collection({ date, userId: 1, drafts: [savedDraft] });
  assert.equal(savedDraft.metadata.breakdown.length, 1);
  assert.equal(savedDraft.metadata.breakdown[0].cash_received, 75);
});

function queueHarness(network, fetchImpl) {
  let stored = '[]';
  const queue = load('offlineTransactionQueue', {
    './serverClock': { getServerNow: () => new Date('2026-10-28T04:00:00Z') },
    './offlineRemittance': { getOfflineRemittanceLock },
    '@react-native-async-storage/async-storage': { default: {
      getItem: async () => stored, setItem: async (_, value) => { stored = value; },
    } },
    '@react-native-community/netinfo': { default: { fetch: async () => network } },
    '../api/axios': { getApiBaseUrl: () => 'https://example.test', buildApiHeaders: () => ({}) },
    '../api/auth': { getAuthToken: () => 'token', getAuthSession: () => ({ user: { user_id: 1 } }) },
  }, { fetch: fetchImpl });
  return queue;
}

test('offline save persists original date and sync uploads collections before remittance', async () => {
  const network = { isConnected: false };
  const uploaded = [];
  const queue = queueHarness(network, async (_, options) => {
    uploaded.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ id: uploaded.length }) };
  });
  await queue.submitOrQueueOfflineTransaction({ type: 'remittance', endpoint: '/remittances',
    payload: { date, amount: 25 }, label: 'Remittance', token: 'token' });
  await queue.queueOfflineTransaction({ type: 'tickets', endpoint: '/vehicle-tickets',
    payload: { ticket_date: date, ticket_fee: 25 }, label: 'Ticket' });
  assert.equal((await queue.getOfflineTransactionDrafts())[0].payload.date, date);
  network.isConnected = true;
  assert.equal((await queue.syncOfflineTransactions()).synced, 2);
  assert.equal(uploaded[0].ticket_date, date);
  assert.equal(uploaded[1].date, date);
  assert.equal((await queue.getOfflineTransactionDrafts()).length, 0);
});

test('connection loss while apparently online preserves remittance as draft', async () => {
  const queue = queueHarness({ isConnected: true }, async () => { throw new Error('Network failed'); });
  const result = await queue.submitOrQueueOfflineTransaction({ type: 'remittance', endpoint: '/remittances',
    payload: { date, amount: 25 }, label: 'Remittance', token: 'token' });
  assert.equal(result.queued, true);
  assert.equal((await queue.getOfflineTransactionDrafts())[0].payload.date, date);
});

test('online remittance waits for pending collections to sync', async () => {
  let posts = 0;
  const queue = queueHarness({ isConnected: true }, async () => { posts++; });
  await queue.queueOfflineTransaction({ type: 'tickets', endpoint: '/vehicle-tickets',
    payload: { ticket_date: date, ticket_fee: 25 }, label: 'Ticket' });
  const result = await queue.submitOrQueueOfflineTransaction({ type: 'remittance', endpoint: '/remittances',
    payload: { date, amount: 25 }, label: 'Remittance', token: 'token' });
  assert.equal(result.queued, true);
  assert.equal(posts, 0);
  assert.equal((await queue.getOfflineTransactionDrafts()).length, 2);
});

test('server validation errors keep the remittance draft for retry', async () => {
  const queue = queueHarness({ isConnected: true }, async () => ({
    ok: false, status: 422, json: async () => ({ message: 'Approver unavailable' }),
  }));
  await queue.queueOfflineTransaction({ type: 'remittance', endpoint: '/remittances',
    payload: { date, amount: 25 }, label: 'Remittance' });
  assert.equal((await queue.syncOfflineTransactions()).synced, 0);
  assert.equal((await queue.getOfflineTransactionDrafts()).length, 1);
});

test('offline remittance locks only its submitter for that Manila calendar day', () => {
  const drafts = [draft('remittance', { date, amount: 75 })];
  assert.equal(getOfflineRemittanceLock(drafts, 1, date).applies_to, 'transactions');
  assert.equal(getOfflineRemittanceLock(drafts, 2, date), null);
  assert.equal(getOfflineRemittanceLock(drafts, 1, '2026-10-26'), null);
  assert.equal(getOfflineRemittanceLock(drafts, undefined, date), null);
});

test('saving an offline remittance prevents further saves until the next day without blocking sync', async () => {
  const network = { isConnected: false };
  const queue = queueHarness(network, async () => ({ ok: true, json: async () => ({ id: 1 }) }));
  await queue.queueOfflineTransaction({ type: 'tickets', endpoint: '/vehicle-tickets', label: 'Ticket',
    payload: { ticket_date: '2026-10-28', ticket_fee: 75 } });
  await queue.queueOfflineTransaction({ type: 'remittance', endpoint: '/remittances', label: 'Remittance',
    payload: { date: '2026-10-28', amount: 75 } });
  for (const type of ['tickets', 'docking', 'banyera', 'remittance']) {
    await assert.rejects(queue.submitOrQueueOfflineTransaction({ type, endpoint: '/test', label: type,
      payload: {}, token: 'token' }), /Transactions are view-only/);
    await assert.rejects(queue.queueOfflineTransaction({ type, endpoint: '/test', label: type,
      payload: {} }), /Transactions are view-only/);
  }
  assert.equal((await queue.getOfflineTransactionDrafts()).length, 2);
  network.isConnected = true;
  assert.equal((await queue.syncOfflineTransactions()).synced, 2);
});

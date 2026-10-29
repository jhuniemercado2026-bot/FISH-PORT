const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  const sockets = [];
  const timers = new Map();
  let timerId = 0;
  class Socket {
    constructor() { this.sent = []; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.onclose?.(); }
    receive(event, data = {}, channel) {
      this.onmessage({ data: JSON.stringify({ event, data: JSON.stringify(data), channel }) });
    }
    subscribe() {
      this.receive('pusher:connection_established', { socket_id: '1.2', activity_timeout: 30 });
      this.receive('pusher_internal:subscription_succeeded', {}, 'transactions');
    }
  }
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../utils/realtimeTransactions.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, WebSocket: Socket,
    process: { env: { EXPO_PUBLIC_PUSHER_APP_KEY: 'test-key' } },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  const runTimer = (delay) => {
    const found = [...timers].find(([, timer]) => timer.delay === delay);
    assert.ok(found, `Expected a ${delay}ms timer`);
    timers.delete(found[0]); found[1].fn();
  };
  return { start: exports.startTransactionsRealtime, sockets, timers, runTimer };
}

test('waits for Pusher handshake and signals successful subscription after each reconnect', () => {
  const h = harness();
  let subscribed = 0;
  const stop = h.start({ onRemittanceUpdate() {}, onSubscribed: () => subscribed++ });
  assert.equal(h.sockets[0].sent.length, 0);
  h.sockets[0].subscribe();
  assert.equal(h.sockets[0].sent[0].event, 'pusher:subscribe');
  assert.equal(h.sockets[0].sent[0].data.channel, 'transactions');
  assert.equal(subscribed, 1);
  h.sockets[0].close();
  h.runTimer(3000);
  h.sockets[1].subscribe();
  assert.equal(subscribed, 2);
  stop();
  assert.equal(h.timers.size, 0);
});

test('all cash collection types notify remittance without passing payments to transaction screens', () => {
  const h = harness();
  const collections = [], transactions = [];
  let remittances = 0;
  const stop = h.start({
    onRemittanceUpdate: () => remittances++,
    onCollectionUpdate: (_, payload) => collections.push(payload.type),
    onTransactionUpdate: (_, payload) => transactions.push(payload.type),
  });
  h.sockets[0].subscribe();
  for (const type of ['tickets', 'docking', 'banyera', 'payment', 'remittance', 'billing']) {
    h.sockets[0].receive('created', { type, record: { id: 1 } }, 'transactions');
  }
  assert.deepEqual(collections, ['tickets', 'docking', 'banyera', 'payment']);
  assert.deepEqual(transactions, ['tickets', 'docking', 'banyera']);
  assert.equal(remittances, 1);
  stop();
});

test('updated and voided collection records notify, unrelated channels do not', () => {
  const h = harness();
  let updates = 0;
  const stop = h.start({ onRemittanceUpdate() {}, onCollectionUpdate: () => updates++ });
  h.sockets[0].subscribe();
  h.sockets[0].receive('.updated', { type: 'tickets', record: { voided_at: 'today' } }, 'transactions');
  h.sockets[0].receive('created', { type: 'tickets', record: { id: 2 } }, 'other-channel');
  assert.equal(updates, 1);
  stop();
});

test('answers server pings and checks idle connections using server activity timeout', () => {
  const h = harness();
  const stop = h.start({ onRemittanceUpdate() {} });
  const socket = h.sockets[0];
  socket.subscribe();
  socket.receive('pusher:ping');
  assert.equal(socket.sent.at(-1).event, 'pusher:pong');
  h.runTimer(30000);
  assert.equal(socket.sent.at(-1).event, 'pusher:ping');
  socket.receive('pusher:pong');
  h.runTimer(30000);
  h.runTimer(30000);
  h.runTimer(3000);
  assert.equal(h.sockets.length, 2);
  stop();
  assert.equal(h.timers.size, 0);
});

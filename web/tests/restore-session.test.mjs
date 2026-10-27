import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

// Run with node --experimental-vm-modules --test tests/restore-session.test.mjs.
// Exercise the bridge's actual effects without a browser or a realtime server.
async function mountBridge({ userId = 1, realtime = false, recovering = false, error = null } = {}) {
  const state = { token: "live-token", recovering, error, requests: 0, redirects: [], cleared: 0 };
  const effects = [];
  const listeners = new Map();
  const timers = [];
  const noop = () => {};
  const channel = {
    listen: (event, callback) => listeners.set(event, callback),
    here: noop, joining: noop, leaving: noop,
  };
  const echo = { channel: () => channel, join: () => channel, leave: noop };
  const queryClient = { clear: () => { state.cleared += 1; } };
  const context = createContext({
    window: {
      setInterval: (callback) => { timers.push(callback); return timers.length; },
      clearInterval: noop, addEventListener: noop, removeEventListener: noop,
      location: { replace: (path) => state.redirects.push(path) },
    },
    sessionStorage: { setItem: noop },
  });
  const dependencies = {
    react: { useEffect: (effect) => effects.push(effect) },
    "@tanstack/react-query": { useQueryClient: () => queryClient },
    "../pages/login/auth": {
      getStoredToken: () => state.token,
      getStoredUser: () => state.token ? { user_id: userId, role: "head" } : null,
      clearStoredAuth: () => { state.token = null; },
      normalizeRole: (role) => String(role || "").toLowerCase(),
    },
    "../api/axios": {
      default: { get: async () => { state.requests += 1; if (state.error) throw state.error; } },
      isDatabaseRecoveryInProgress: () => state.recovering,
    },
    "../lib/realtime": {
      getEcho: () => realtime ? echo : null, disconnectEcho: noop,
      REALTIME_AUTH_CHANGED_EVENT: "auth-changed",
    },
    "../hooks/useUsersQuery": { syncUsersQueryCache: noop },
    "../hooks/useReportUsersQuery": { syncReportUsersQueryCache: noop },
    "../store/accountPresenceStore": {
      accountPresenceActions: {
        clearOnlineUsers: noop, setOnlineUsers: noop, setUserOnline: noop, setUserOffline: noop,
      },
    },
  };
  const source = await readFile(new URL("../src/components/AccountStatusRealtimeBridge.jsx", import.meta.url), "utf8");
  const module = new SourceTextModule(source, { context });
  await module.link((specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `Unexpected dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  module.namespace.default();
  const cleanups = effects.map((effect) => effect());
  await setImmediate();
  return { state, listeners, poll: timers[0], cleanup: () => cleanups.forEach((cleanup) => cleanup?.()) };
}

test("revoked sessions log out without realtime", async () => {
  const bridge = await mountBridge({ error: { response: { status: 401 } } });
  assert.equal(bridge.state.token, null);
  assert.deepEqual(bridge.state.redirects, ["/login"]);
  assert.equal(bridge.state.cleared, 1);
  bridge.cleanup();
});

test("network and server failures keep the session", async () => {
  for (const error of [new Error("Offline"), { response: { status: 500 } }]) {
    const bridge = await mountBridge({ error });
    assert.equal(bridge.state.token, "live-token");
    assert.deepEqual(bridge.state.redirects, []);
    bridge.cleanup();
  }
});

test("uploader is not polled while the SQL import replaces tokens", async () => {
  const bridge = await mountBridge({ recovering: true, error: { response: { status: 401 } } });
  assert.equal(bridge.state.requests, 0);
  assert.equal(bridge.state.token, "live-token");
  bridge.state.recovering = false;
  bridge.state.error = null;
  await bridge.poll();
  assert.equal(bridge.state.requests, 1);
  assert.equal(bridge.state.token, "live-token");
  bridge.cleanup();
});

test("the restored event excludes the uploader and logs out another head", async () => {
  for (const userId of [1, 2]) {
    const bridge = await mountBridge({ userId, realtime: true });
    bridge.listeners.get(".restored")({
      resource: "database", action: "restored",
      record: { excluded_user_id: 1, affected_roles: ["head", "coordinator", "inspector"] },
    });
    assert.equal(bridge.state.token, userId === 1 ? "live-token" : null);
    assert.deepEqual(bridge.state.redirects, userId === 1 ? [] : ["/login"]);
    bridge.cleanup();
  }
});

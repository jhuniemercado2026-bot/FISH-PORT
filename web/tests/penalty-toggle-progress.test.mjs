import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

async function loadOperation({ refreshFails = false, lostResponse = false } = {}) {
  const patch = deferred();
  const refresh = deferred();
  const snapshots = [];
  const timers = new Map();
  let timerId = 0, calls = 0, invalidations = 0;
  const context = createContext({
    AbortController,
    crypto: { randomUUID: () => "c8f9d27b-73cc-4a9c-81f0-af61e4a6bf89" },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  const create = (initialize) => {
    let state = initialize();
    const store = () => state;
    store.getState = () => state;
    store.setState = (values) => { state = { ...state, ...values }; snapshots.push(state.operation); };
    return store;
  };
  const api = {
    patch: () => { calls++; return patch.promise; },
    get: async (url) => {
      if (url.includes("/progress/")) return { data: { data: { progress: lostResponse ? 100 : 41, processed: 4, total: 10, status: lostResponse ? "completed" : "running" } } };
      if (refreshFails) throw new Error("Refresh connection failed");
      return { data: { data: { version: 2 } } };
    },
  };
  const dependencies = {
    zustand: { create },
    "../api/axios": { default: api },
    "../utils/penaltySettingsSync": { syncPenaltySettings: () => refresh.promise },
  };
  const source = await readFile(new URL("../src/store/penaltyToggleStore.js", import.meta.url), "utf8");
  const module = new SourceTextModule(source, { context });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const queryClient = { setQueriesData() {}, invalidateQueries: async () => { invalidations++; } };
  return {
    ...module.namespace, patch, refresh, snapshots, queryClient,
    calls: () => calls, invalidations: () => invalidations,
    poll: async () => {
      const [id, timer] = [...timers].find(([, item]) => item.delay < 1000);
      timers.delete(id);
      await timer.callback();
    },
  };
}

const rule = { id: 1, name: "Monthly Penalty", is_active: true };

test("global operation keeps progress while the Settings page is absent and blocks repeat clicks", async () => {
  const env = await loadOperation();
  const pending = env.togglePenaltyRule(env.queryClient, rule);
  assert.equal(env.usePenaltyToggleStore.getState().operation.progress, 0);
  await env.poll();
  assert.equal(env.usePenaltyToggleStore.getState().operation.progress, 41);
  assert.equal(await env.togglePenaltyRule(env.queryClient, rule), false);
  assert.equal(env.calls(), 1);
  env.dismissPenaltyProgress();
  assert.equal(env.usePenaltyToggleStore.getState().operation.status, "running");
  env.patch.resolve({ data: { data: { ...rule, is_active: false } } });
  await setImmediate();
  assert.equal(env.usePenaltyToggleStore.getState().operation.progress, 95);
  assert.equal(env.usePenaltyToggleStore.getState().operation.status, "running");
  env.refresh.resolve();
  assert.equal(await pending, true);
  assert.equal(env.usePenaltyToggleStore.getState().operation.progress, 100);
  assert.equal(env.usePenaltyToggleStore.getState().operation.status, "success");
  assert.deepEqual(env.snapshots.filter(Boolean).map((item) => item.progress), [0, 41, 95, 100]);
});

test("validation failures show an error without reporting completion", async () => {
  const env = await loadOperation();
  const pending = env.togglePenaltyRule(env.queryClient, rule);
  env.patch.reject({ response: { data: { errors: { effective_from: ["Dates overlap another penalty."] } } } });
  assert.equal(await pending, false);
  const operation = env.usePenaltyToggleStore.getState().operation;
  assert.equal(operation.status, "error");
  assert.equal(operation.message, "Dates overlap another penalty.");
  assert.ok(operation.progress < 100);
  env.dismissPenaltyProgress();
  assert.equal(env.usePenaltyToggleStore.getState().operation, null);
});

test("a refresh failure does not misreport a committed toggle as failed", async () => {
  const env = await loadOperation({ refreshFails: true });
  const pending = env.togglePenaltyRule(env.queryClient, rule);
  env.patch.resolve({ data: { data: { ...rule, is_active: false } } });
  assert.equal(await pending, true);
  assert.equal(env.usePenaltyToggleStore.getState().operation.status, "success");
  assert.match(env.usePenaltyToggleStore.getState().operation.message, /Refresh the page/);
  assert.equal(env.invalidations(), 1);
});

test("a lost save response is recovered from confirmed server completion without a second toggle", async () => {
  const env = await loadOperation({ lostResponse: true });
  const pending = env.togglePenaltyRule(env.queryClient, rule);
  env.patch.reject(new Error("Response lost"));
  env.refresh.resolve();
  assert.equal(await pending, true);
  assert.equal(env.calls(), 1);
  assert.equal(env.usePenaltyToggleStore.getState().operation.status, "success");
});

import test from "node:test";
import assert from "node:assert/strict";

import { readCronHealth, trackCronJob } from "./cron-health.js";

function kv() {
  const values = new Map();
  return {
    values,
    async put(key, value) { values.set(key, value); },
    async get(key) { return values.has(key) ? JSON.parse(values.get(key)) : null; },
  };
}

test("trackCronJob records a successful job", async () => {
  const store = kv();
  const record = await trackCronJob(
    { ADMIN_SETTINGS: store },
    "translation",
    async () => ({ ok: true, detail: "4 events current." }),
    { now: () => "2026-09-08T12:00:00.000Z" },
  );
  assert.deepEqual(record, {
    ranAt: "2026-09-08T12:00:00.000Z",
    ok: true,
    detail: "4 events current.",
  });
  assert.deepEqual(JSON.parse(store.values.get("cron.health.translation")), record);
});

test("trackCronJob turns a thrown error into a visible failure record", async () => {
  const store = kv();
  const record = await trackCronJob(
    { ADMIN_SETTINGS: store },
    "buddyRetention",
    async () => { throw new Error("D1 unavailable"); },
    { now: () => "now" },
  );
  assert.deepEqual(record, { ranAt: "now", ok: false, detail: "D1 unavailable" });
});

test("readCronHealth degrades safely without a settings binding", async () => {
  assert.deepEqual(await readCronHealth({}), { supported: false, jobs: {} });
});

test("readCronHealth returns both known job slots, including never-run jobs", async () => {
  const store = kv();
  store.values.set("cron.health.translation", JSON.stringify({ ranAt: "then", ok: true, detail: "Done." }));
  assert.deepEqual(await readCronHealth({ ADMIN_SETTINGS: store }), {
    supported: true,
    jobs: {
      translation: { ranAt: "then", ok: true, detail: "Done." },
      buddyRetention: null,
    },
  });
});

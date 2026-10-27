import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("../src/lib/dashboardReceivables.js", import.meta.url), "utf8");
const { getBilledReceivables } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const fixture = () => ({
  bills: [{ bill_id: 1, created_at: "2025-06-01", total_amount: 1300 }],
  penalties: [
    { id: 1, bill_id: 1, date: "2025-12-01", amount: 100 },
    { id: 2, bill_id: 1, date: "2026-01-01", amount: 200 },
  ],
  payments: [{ bill_id: 1, payment_date: "2025-06-01", amount_paid: 250 }],
});

test("penalties on an older bill stay in the bill fiscal year and month", () => {
  const data = fixture();
  const older = getBilledReceivables(data, 2025);
  const newer = getBilledReceivables(data, 2026);
  assert.equal(older.total, 1050);
  assert.equal(older.monthly[5], 1050);
  assert.equal(older.monthly[11], 0);
  assert.equal(newer.total, 0);
  assert.equal(newer.monthly[0], 0);
  assert.equal(older.total + newer.total, 1300 - 250);
});

test("later payments reduce the original bill fiscal year without leaking into another year", () => {
  const data = fixture();
  data.payments.push({ bill_id: 1, payment_date: "2026-01-02", amount_paid: 900 });
  assert.equal(getBilledReceivables(data, 2026).total, 0);
  assert.equal(getBilledReceivables(data, 2025).total, 150);
});

test("turning unpaid penalties off removes them without reducing the principal twice", () => {
  const data = fixture();
  data.bills[0].total_amount = 1000;
  data.penalties = [];
  assert.equal(getBilledReceivables(data, 2026).total, 0);
  assert.equal(getBilledReceivables(data, 2025).total, 750);
});

test("paid retained penalties are not counted as receivable after switching off", () => {
  const data = fixture();
  data.bills[0].total_amount = 1050;
  data.penalties = [{ id: 1, bill_id: 1, date: "2026-01-01", amount: 50 }];
  data.payments = [{ bill_id: 1, payment_date: "2026-01-01", amount_paid: 1050 }];
  assert.equal(getBilledReceivables(data, 2026).total, 0);
});

test("empty data and cent amounts remain exact", () => {
  assert.equal(getBilledReceivables({}, 2026).total, 0);
  const result = getBilledReceivables({
    bills: [{ bill_id: 1, created_at: "2026-01-01", total_amount: 10.3 }],
    payments: [{ bill_id: 1, payment_date: "2026-01-01", amount_paid: 10.1 }],
  }, 2026);
  assert.equal(result.total, 0.2);
});

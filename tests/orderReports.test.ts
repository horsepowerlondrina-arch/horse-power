import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import {
  orderResult,
  reportTotals,
  reportDate,
  selectReportOrders,
  type OrderFilters,
} from "../src/lib/orderReports";
import { resultWorkbook } from "../src/lib/reportWorkbook";
import type { Order } from "../src/lib/types";

const order = {
  id: "o",
  kind: "order",
  number: 1,
  status: "completed",
  display_status: "awaiting_payment",
  customer_name: "=1+1 & João",
  plate: "ABC1D23",
  customer_id: "customer",
  vehicle_id: "vehicle",
  brand: "Chevrolet",
  model: "Cobalt",
  due_on: "2026-10-07",
  km: 0,
  problem: "",
  notes: "",
  entered_on: "2026-10-01",
  completed_on: "2026-10-04T02:00:00Z",
  total: 90000,
  discount: 10000,
  items: [
    {
      id: "part",
      kind: "product",
      name: "Peça <original>",
      quantity: 2,
      price: 30000,
      cost: 15000,
    },
    {
      id: "service",
      kind: "service",
      name: "Serviço de terceiros",
      quantity: 1,
      price: 40000,
      cost: 12000,
      duration_seconds: 5400,
    },
  ],
} as Order;
const data = {
  receivables: [{ id: "r", order_id: "o" }],
  installments: [
    { id: "i1", status: "paid", paid_at: "2026-10-06T02:30:00Z", fee: 300 },
    { id: "i2", status: "paid", paid_at: "2026-10-06T15:00:00Z", fee: 400 },
    { id: "i3", status: "open", fee: 50000 },
  ],
  cash: [
    {
      id: "c1",
      receivable_id: "r",
      installment_id: "i1",
      created_at: "2026-10-06 02:30:00",
      gross_amount: 20000,
      fee_amount: 300,
      amount: 19700,
      method: "credit",
    },
    {
      id: "c2",
      receivable_id: "r",
      installment_id: "i2",
      created_at: "2026-10-06 15:00:00",
      gross_amount: 20000,
      fee_amount: 400,
      amount: 19600,
      method: "credit",
    },
    { id: "foreign", receivable_id: "other", fee_amount: 99999, amount: 1 },
  ],
};
const filters: OrderFilters = {
  from: "2026-10-05",
  to: "2026-10-06",
  basis: "payment",
  statuses: [],
};
test("payment filter uses São Paulo payment dates inclusively and never duplicates an OS", () => {
  assert.equal(reportDate("2026-10-04T02:00:00Z"), "03/10/2026");
  assert.equal(
    selectReportOrders(
      [{ ...order, id: "unpaid" }],
      { ...filters, from: "", to: "" },
      data,
    ).length,
    0,
  );
  assert.equal(selectReportOrders([order], filters, data).length, 1);
  assert.equal(
    selectReportOrders([order], { ...filters, to: "2026-10-05" }, data).length,
    1,
  );
  assert.equal(
    selectReportOrders(
      [order],
      { ...filters, from: "2026-10-07", to: "2026-10-08" },
      data,
    ).length,
    0,
  );
  assert.equal(
    selectReportOrders([{ ...order, id: "unpaid" }], filters, data).length,
    0,
  );
});
test("opening, completion, statuses, search and quotes are filtered together", () => {
  assert.equal(
    selectReportOrders(
      [order],
      {
        ...filters,
        basis: "completion",
        from: "2026-10-03",
        to: "2026-10-03",
        statuses: ["awaiting_payment"],
      },
      data,
      "joão",
    ).length,
    1,
  );
  assert.equal(
    selectReportOrders(
      [order],
      {
        ...filters,
        basis: "opening",
        from: "2026-10-01",
        to: "2026-10-01",
        statuses: ["working", "awaiting_payment"],
      },
      data,
    ).length,
    1,
  );
  assert.equal(
    selectReportOrders([order], { ...filters, statuses: ["completed"] }, data)
      .length,
    0,
  );
  assert.equal(
    selectReportOrders([{ ...order, kind: "quote" }], filters, data).length,
    0,
  );
});
test("full OS result preserves saved costs and subtracts only realized fees once", () => {
  const result = orderResult(order, data);
  assert.equal(result.productSale, 60000);
  assert.equal(result.serviceSale, 40000);
  assert.equal(result.productCost, 30000);
  assert.equal(result.serviceCost, 12000);
  assert.equal(result.fees, 700);
  assert.equal(result.result, 47300);
  assert.equal(result.payments.length, 2);
  // A period matching only the first receipt still includes the complete OS and both paid fees.
  const selected = selectReportOrders(
    [order],
    { ...filters, to: "2026-10-05" },
    data,
  );
  assert.equal(orderResult(selected[0], data).result, 47300);
  assert.deepEqual(reportTotals([result]), {
    total: 90000,
    cost: 42000,
    fees: 700,
    result: 47300,
  });
  assert.equal(
    orderResult(
      {
        ...order,
        total: 0,
        items: [{ id: "own", kind: "service", quantity: 1, price: 0 }],
      },
      data,
    ).margin,
    null,
  );
});
test("Excel is an OOXML ZIP snapshot with typed money and safe literal user text", () => {
  const bytes = resultWorkbook(
    [orderResult(order, data)],
    filters,
    "",
    "Horse Power",
  );
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes("Peça &lt;original&gt;"));
  assert.ok(text.includes("=1+1 &amp; João"));
  assert.ok(!text.includes("<f>"));
  assert.ok(text.includes("<v>473</v>"));
  if (process.env.REPORT_TEST_XLSX)
    writeFileSync(process.env.REPORT_TEST_XLSX, bytes);
});


test("missing part costs exclude entire OS profit while preserving revenue and valid zero-cost internal services", () => {
  const incomplete = { ...order, items: order.items.map((i) => i.kind === "product" ? { ...i, cost: 0 } : i) };
  const result = orderResult(incomplete, data);
  assert.equal(result.result, null);
  assert.equal(result.margin, null);
  assert.equal(result.products[0].result, null);
  assert.equal(reportTotals([result]).result, 0);
  assert.equal(reportTotals([result, orderResult(order, data)]).result, 47300);
  assert.equal(reportTotals([result]).total, order.total);
  const bytes = resultWorkbook([result], filters, "", "Oficina");
  assert.match(new TextDecoder().decode(bytes), /Custo não informado/);
  const corrected = orderResult({ ...incomplete, items: order.items }, data);
  assert.equal(corrected.result, 47300);
  const internal = orderResult({ ...order, total: 5000, items: [{ id: "internal", kind: "service", price: 5000, quantity: 1, cost: 0 }] }, { receivables: [], cash: [], installments: [] });
  assert.equal(internal.result, 5000);
});

test("parts without costs never inflate profit; service discounts and third-party costs are separate", async () => {
  const { revenueBreakdown } = await import("../src/lib/workflow");
  const sample = { ...order, kind: "order", status: "completed", completed_on: "2026-10-08T15:00:00Z", total: 45000, discount: 5000, items: [
    { id: "part", kind: "product", price: 20000, cost: 0, quantity: 1 },
    { id: "own", kind: "service", price: 20000, cost: 0, quantity: 1 },
    { id: "third", kind: "service", price: 10000, cost: 6000, quantity: 1 },
  ] } as typeof order;
  const totals = revenueBreakdown([sample], "2026-10-01", "2026-10-31");
  assert.equal(totals.products, 18000);
  assert.equal(totals.productProfit, 0);
  assert.equal(totals.missingCostOrders, 1);
  assert.equal(totals.services, 27000);
  assert.equal(totals.serviceCost, 6000);
  assert.equal(totals.serviceProfit, 21000);
  const fixed = { ...sample, items: sample.items.map((i) => i.kind === "product" ? { ...i, cost: 12000 } : i) };
  assert.equal(revenueBreakdown([fixed], "2026-10-01", "2026-10-31").productProfit, 6000);
  const mixed = { ...fixed, items: [...fixed.items, { id: "unknown", kind: "product", quantity: 1, price: 1000, cost: 0 }] };
  assert.equal(orderResult(mixed, data).result, null);
});

test("unified attendance list includes anonymous quotes by status without adding them to financial reports", () => {
  const quote = { ...order, id: "quote", kind: "quote", status: "quote", display_status: "quote", customer_id: null, vehicle_id: null, customer_name: "Cliente não informado", completed_on: "", entered_on: "2026-10-01" } as unknown as typeof order;
  const all = { ...filters, basis: "opening" as const, from: "", to: "", statuses: [] };
  assert.equal(selectReportOrders([order, quote], all, data, "", true).length, 2);
  assert.deepEqual(selectReportOrders([order, quote], { ...all, statuses: ["quote"] }, data, "", true).map((o) => o.id), ["quote"]);
  assert.equal(selectReportOrders([quote], all, data).length, 0);
  assert.equal(selectReportOrders([quote], { ...all, basis: "completion" }, data, "", true).length, 0);
  assert.equal(selectReportOrders([quote], { ...all, basis: "payment" }, data, "", true).length, 0);
});

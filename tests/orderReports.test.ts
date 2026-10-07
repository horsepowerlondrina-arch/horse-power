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

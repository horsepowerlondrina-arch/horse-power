import { randomUUID } from "node:crypto";
import { transaction, type DB } from "../db/database";
import type { Context } from "../auth/session";
import { assertTransition, totalOf, type Status } from "../domain/orders";
import { configurePlan, settleInstallment, requireAdmin } from "./payments";
export const id = () => randomUUID();
export type Row = Record<string, any>;
export async function scoped(
  db: DB,
  table: string,
  tenant: string,
  record: string,
): Promise<Row> {
  const row = await db
    .prepare(`SELECT * FROM ${table} WHERE tenant_id=? AND id=?`)
    .get(tenant, record);
  if (!row)
    throw Object.assign(new Error("Registro não encontrado nesta oficina."), {
      status: 404,
    });
  return row;
}
export async function audit(
  db: DB,
  ctx: Context,
  action: string,
  entity: string,
) {
  await db
    .prepare(
      "INSERT INTO audit_events(id,tenant_id,user_id,action,entity_id) VALUES(?,?,?,?,?)",
    )
    .run(id(), ctx.tenantId, ctx.userId, action, entity);
}
export async function listOrders(db: DB, tenant: string): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT o.*,COALESCE(c.name,NULLIF(o.guest_name,''),'Cliente não informado') customer_name,
 COALESCE(v.plate,o.guest_plate) plate,COALESCE(v.brand,'') brand,COALESCE(v.model,o.guest_vehicle) model,
 r.id receivable_id,r.status payment_status,
 CASE WHEN o.status='completed' AND r.status='open' THEN 'awaiting_payment' ELSE o.status END display_status
 FROM orders o LEFT JOIN customers c ON c.id=o.customer_id AND c.tenant_id=o.tenant_id
 LEFT JOIN vehicles v ON v.id=o.vehicle_id AND v.tenant_id=o.tenant_id
 LEFT JOIN receivables r ON r.order_id=o.id AND r.tenant_id=o.tenant_id
 WHERE o.tenant_id=? ORDER BY o.number DESC`,
    )
    .all(tenant);
  const items = await db
    .prepare(
      "SELECT i.*,p.name professional_name FROM order_items i LEFT JOIN professionals p ON p.id=i.professional_id AND p.tenant_id=i.tenant_id WHERE i.tenant_id=?",
    )
    .all(tenant);
  const byOrder = new Map<string, Row[]>();
  for (const item of items) {
    const group = byOrder.get(item.order_id) || [];
    group.push(item);
    byOrder.set(item.order_id, group);
  }
  return rows.map((o) => ({ ...o, items: byOrder.get(o.id) || [] }));
}
export async function saveOrder(
  db: DB,
  ctx: Context,
  input: Row,
  record?: string,
) {
  requireAdmin(ctx);
  return await transaction(db, async () => {
    const old = record
      ? await scoped(db, "orders", ctx.tenantId, record)
      : null;
    if (old && ["completed", "cancelled"].includes(old.status))
      throw new Error(
        "Ordens finalizadas ou canceladas não podem ser editadas.",
      );
    const kind = old?.kind || (input.status === "quote" ? "quote" : "order");
    const customerId = input.customer_id || null,
      vehicleId = input.vehicle_id || null;
    if (kind === "order" && (!customerId || !vehicleId))
      throw new Error("Selecione o cliente e o veículo para a OS.");
    const customer = customerId
      ? await scoped(db, "customers", ctx.tenantId, customerId)
      : null;
    const vehicle = vehicleId
      ? await scoped(db, "vehicles", ctx.tenantId, vehicleId)
      : null;
    if ((customer && !customer.active) || (vehicle && !vehicle.active))
      throw new Error("Escolha cliente e veículo ativos.");
    if (vehicle && vehicle.customer_id !== customerId)
      throw new Error("O veículo não pertence ao cliente selecionado.");
    if (input.due_on < input.entered_on)
      throw new Error("A previsão não pode ser anterior à entrada.");
    const previous = old
      ? await db
          .prepare("SELECT * FROM order_items WHERE tenant_id=? AND order_id=?")
          .all(ctx.tenantId, record!)
      : [];
    const items = await Promise.all(
      input.items.map(async (item: Row) => {
        const catalog = await scoped(
          db,
          "catalog",
          ctx.tenantId,
          item.catalog_id,
        );
        if (!catalog.active) throw new Error("Um dos itens está inativo.");
        if (
          item.professional_id &&
          !(
            await scoped(
              db,
              "professionals",
              ctx.tenantId,
              item.professional_id,
            )
          ).active
        )
          throw new Error("Profissional inativo.");
        const prior = previous.find(
          (p) => p.id === item.id && p.catalog_id === item.catalog_id,
        );
        return {
          ...item,
          snapshotId: prior?.id || id(),
          kind: catalog.kind,
          name: prior?.name || catalog.name,
          cost: prior?.cost ?? catalog.cost,
          professional_id: item.professional_id || null,
        };
      }),
    );
    const total = totalOf(items, input.discount);
    const orderId = record || id();
    const values = [
      customerId,
      vehicleId,
      input.guest_name || "",
      input.guest_plate || "",
      input.guest_vehicle || "",
      input.entered_on,
      input.due_on,
      input.km,
      input.problem,
      input.notes,
      input.discount,
      total,
    ];
    if (old)
      await db
        .prepare(
          "UPDATE orders SET customer_id=?,vehicle_id=?,guest_name=?,guest_plate=?,guest_vehicle=?,entered_on=?,due_on=?,km=?,problem=?,notes=?,discount=?,total=? WHERE tenant_id=? AND id=?",
        )
        .run(...values, ctx.tenantId, orderId);
    else {
      const number = Number(
        (await db
          .prepare(
            "SELECT COALESCE(MAX(number),1000)+1 number FROM orders WHERE tenant_id=?",
          )
          .get(ctx.tenantId))!.number,
      );
      await db
        .prepare(
          "INSERT INTO orders(id,tenant_id,number,kind,status,customer_id,vehicle_id,guest_name,guest_plate,guest_vehicle,entered_on,due_on,km,problem,notes,discount,total) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          orderId,
          ctx.tenantId,
          number,
          kind,
          kind === "quote" ? "quote" : "open",
          ...values,
        );
    }
    await db
      .prepare("DELETE FROM order_items WHERE tenant_id=? AND order_id=?")
      .run(ctx.tenantId, orderId);
    for (const item of items)
      await db
        .prepare("INSERT INTO order_items VALUES(?,?,?,?,?,?,?,?,?,?)")
        .run(
          item.snapshotId,
          ctx.tenantId,
          orderId,
          item.catalog_id,
          item.professional_id,
          item.kind,
          item.name,
          item.quantity,
          item.price,
          item.cost,
        );
    await audit(
      db,
      ctx,
      old ? "order.updated" : `order.created.${kind}`,
      orderId,
    );
    return orderId;
  });
}
export async function transitionOrder(
  db: DB,
  ctx: Context,
  record: string,
  status: Status,
) {
  return await transaction(db, async () => {
    const order = await scoped(db, "orders", ctx.tenantId, record);
    if (
      ctx.role !== "owner" &&
      (order.kind !== "order" ||
        !["working", "ready"].includes(status) ||
        !["open", "working", "ready"].includes(order.status))
    )
      throw Object.assign(
        new Error("O mecânico pode iniciar ou marcar o serviço como pronto."),
        { status: 403 },
      );
    assertTransition(order.status, status);
    if (order.kind === "quote" && status === "open") {
      if (!order.customer_id || !order.vehicle_id)
        throw new Error(
          "Vincule cliente e veículo antes de transformar o orçamento em OS.",
        );
      const c = await scoped(db, "customers", ctx.tenantId, order.customer_id),
        v = await scoped(db, "vehicles", ctx.tenantId, order.vehicle_id);
      if (!c.active || !v.active || v.customer_id !== c.id)
        throw new Error("Confira o cliente e o veículo antes da aprovação.");
    }
    if (status === "completed") {
      const items = (await db
        .prepare("SELECT * FROM order_items WHERE tenant_id=? AND order_id=?")
        .all(ctx.tenantId, record)) as Row[];
      if (!items.length)
        throw new Error(
          "Adicione pelo menos um produto ou serviço para finalizar.",
        );
      for (const item of items.filter((i) => i.kind === "product")) {
        const changed = await db
          .prepare(
            "UPDATE catalog SET stock=stock-? WHERE tenant_id=? AND id=? AND stock>=?",
          )
          .run(item.quantity, ctx.tenantId, item.catalog_id, item.quantity);
        if (!changed.changes)
          throw new Error(`Estoque insuficiente: ${item.name}.`);
        await db
          .prepare(
            "INSERT INTO stock_movements(id,tenant_id,catalog_id,order_id,quantity,reason,user_id) VALUES(?,?,?,?,?,?,?)",
          )
          .run(
            id(),
            ctx.tenantId,
            item.catalog_id,
            record,
            -item.quantity,
            `OS #${order.number}`,
            ctx.userId,
          );
      }
      if (order.total > 0)
        await db
          .prepare(
            "INSERT INTO receivables(id,tenant_id,order_id,customer_id,description,amount,due_on,gross_total,net_total) VALUES(?,?,?,?,?,?,?,?,?)",
          )
          .run(
            id(),
            ctx.tenantId,
            record,
            order.customer_id,
            `OS #${order.number}`,
            order.total,
            order.due_on,
            order.total,
            order.total,
          );
    }
    await db
      .prepare(
        "UPDATE orders SET status=?,kind=?,completed_on=? WHERE tenant_id=? AND id=?",
      )
      .run(
        status,
        order.kind === "quote" && status === "open" ? "order" : order.kind,
        status === "completed" ? new Date().toISOString() : null,
        ctx.tenantId,
        record,
      );
    await audit(db, ctx, `order.${status}`, record);
  });
}
export async function settle(
  db: DB,
  ctx: Context,
  record: string,
  method: string,
) {
  requireAdmin(ctx);
  const r = await scoped(db, "receivables", ctx.tenantId, record);
  if (r.status !== "open") throw new Error("Esta conta já foi recebida.");
  if (!r.plan_configured)
    await configurePlan(db, ctx, record, {
      method,
      installments: 1,
      card_fee_bps: 0,
      interest_bps: 0,
      first_due_on: r.due_on,
    });
  const parts = await db
    .prepare(
      "SELECT id FROM payment_installments WHERE tenant_id=? AND receivable_id=? AND status='open'",
    )
    .all(ctx.tenantId, record);
  if (parts.length !== 1)
    throw new Error("Receba cada parcela na tela de pagamento.");
  await settleInstallment(db, ctx, String(parts[0].id));
}
export async function mechanicWorkspace(db: DB, tenant: string) {
  const orders = (await listOrders(db, tenant))
    .filter((o) => o.kind === "order")
    .map((o) => ({
      id: o.id,
      number: o.number,
      kind: o.kind,
      status: o.status,
      display_status: o.status,
      customer_name: o.customer_name,
      plate: o.plate,
      brand: o.brand,
      model: o.model,
      entered_on: o.entered_on,
      due_on: o.due_on,
      completed_on: o.completed_on,
      km: o.km,
      problem: o.problem,
      notes: o.notes,
      items: o.items.map((i: Row) => ({
        id: i.id,
        kind: i.kind,
        name: i.name,
        quantity: i.quantity,
        professional_name: i.professional_name,
      })),
    }));
  return {
    orders,
    customers: [],
    vehicles: [],
    catalog: [],
    professionals: [],
    receivables: [],
    cash: [],
    movements: [],
    installments: [],
    payment_settings: null,
  };
}

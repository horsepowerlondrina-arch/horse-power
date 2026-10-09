import { transaction, type DB } from "../db/database.js";
import type { Context } from "../auth/session.js";
import { calculatePlan, type PaymentInput } from "../domain/payments.js";
import { id, scoped, audit } from "./workshop.js";
import { cashAccount, cashToday, recordCash } from "./cashControl.js";
import { nextBankingDay } from "../../shared/bankingDays.js";
export function requireAdmin(ctx: Context) {
  if (ctx.role !== "owner")
    throw Object.assign(new Error("Esta ação é exclusiva do administrador."), {
      status: 403,
    });
}
export async function configurePlan(
  db: DB,
  ctx: Context,
  record: string,
  input: PaymentInput,
) {
  requireAdmin(ctx);
  return await transaction(db, async () => {
    const r = await scoped(db, "receivables", ctx.tenantId, record);
    if (
      r.status === "paid" ||
      (await db
        .prepare(
          "SELECT 1 FROM payment_installments WHERE tenant_id=? AND receivable_id=? AND status='paid'",
        )
        .get(ctx.tenantId, record))
    )
      throw new Error("O plano não pode mudar após um recebimento.");
    const plan = calculatePlan(r.amount, input);
    const saleOn =
      input.method === "Cartão de crédito" ? input.sale_on || cashToday() : "";
    if (saleOn) {
      nextBankingDay(saleOn);
      if (saleOn > cashToday())
        throw new Error("A data da venda não pode ser futura.");
    }
    await db
      .prepare(
        "DELETE FROM payment_installments WHERE tenant_id=? AND receivable_id=?",
      )
      .run(ctx.tenantId, record);
    for (const part of plan.installments)
      await db
        .prepare(
          "INSERT INTO payment_installments(id,tenant_id,receivable_id,sequence,due_on,principal,interest,gross,fee,net,method) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id(),
          ctx.tenantId,
          record,
          part.sequence,
          part.due_on,
          part.principal,
          part.interest,
          part.gross,
          part.fee,
          part.net,
          input.method,
        );
    await db
      .prepare(
        "UPDATE receivables SET plan_configured=1,installment_count=?,card_fee_bps=?,interest_bps=?,gross_total=?,fee_total=?,net_total=?,method=?,due_on=?,card_sale_on=? WHERE tenant_id=? AND id=?",
      )
      .run(
        input.installments,
        input.card_fee_bps,
        input.interest_bps,
        plan.gross,
        plan.fee,
        plan.net,
        input.method,
        saleOn ? nextBankingDay(saleOn) : input.first_due_on,
        saleOn,
        ctx.tenantId,
        record,
      );
    await audit(db, ctx, "payment.plan_configured", record);
    return plan;
  });
}
export async function settleInstallment(
  db: DB,
  ctx: Context,
  record: string,
  accountId?: string,
) {
  requireAdmin(ctx);
  return await transaction(db, async () => {
    const part = await scoped(db, "payment_installments", ctx.tenantId, record);
    if (part.method === "Cartão de crédito")
      return settleCredit(db, ctx, String(part.receivable_id), accountId);
    if (part.status !== "open")
      throw new Error("Esta parcela já foi recebida.");
    const now = new Date().toISOString();
    const day = cashToday(),
      account = await cashAccount(db, ctx, accountId, day);
    await db
      .prepare(
        "UPDATE payment_installments SET status='paid',paid_at=? WHERE tenant_id=? AND id=?",
      )
      .run(now, ctx.tenantId, record);
    await db
      .prepare(
        "INSERT INTO cash_entries(id,tenant_id,receivable_id,installment_id,amount,gross_amount,fee_amount,method) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        id(),
        ctx.tenantId,
        part.receivable_id,
        record,
        part.net,
        part.gross,
        part.fee,
        part.method,
      );
    const pending = (await db
      .prepare(
        "SELECT COUNT(*) n FROM payment_installments WHERE tenant_id=? AND receivable_id=? AND status='open'",
      )
      .get(ctx.tenantId, part.receivable_id))!.n;
    await db
      .prepare(
        "UPDATE receivables SET status=?,paid_at=? WHERE tenant_id=? AND id=?",
      )
      .run(
        pending ? "open" : "paid",
        pending ? null : now,
        ctx.tenantId,
        part.receivable_id,
      );
    if (pending)
      await db
        .prepare(
          "UPDATE receivables SET due_on=(SELECT MIN(due_on) FROM payment_installments WHERE tenant_id=? AND receivable_id=? AND status='open') WHERE tenant_id=? AND id=?",
        )
        .run(
          ctx.tenantId,
          part.receivable_id,
          ctx.tenantId,
          part.receivable_id,
        );
    const order = await db
      .prepare(
        "SELECT o.number FROM orders o JOIN receivables r ON r.order_id=o.id AND r.tenant_id=o.tenant_id WHERE r.tenant_id=? AND r.id=?",
      )
      .get(ctx.tenantId, part.receivable_id);
    await recordCash(db, ctx, account, {
      day,
      amount: part.net,
      gross_amount: part.gross,
      fee_amount: part.fee,
      description:
        "Recebimento OS #" + order?.number + " · parcela " + part.sequence,
      method: part.method,
      origin: "receipt",
      source_id: record,
    });
    await audit(db, ctx, "payment.installment_paid", record);
  });
}

export async function settleCredit(
  db: DB,
  ctx: Context,
  record: string,
  accountId?: string,
  saleOn?: string,
) {
  requireAdmin(ctx);
  return transaction(db, async () => {
    const receivable = await scoped(db, "receivables", ctx.tenantId, record);
    if (
      receivable.method !== "Cartão de crédito" ||
      !receivable.plan_configured
    )
      throw new Error(
        "Configure o pagamento no cartão de crédito antes de receber.",
      );
    const parts = await db
      .prepare(
        "SELECT * FROM payment_installments WHERE tenant_id=? AND receivable_id=? AND status='open' ORDER BY sequence",
      )
      .all(ctx.tenantId, record);
    if (!parts.length || receivable.status === "paid")
      throw new Error("Este cartão já foi recebido.");
    const sale = String(receivable.card_sale_on || saleOn || cashToday());
    const day = nextBankingDay(sale);
    if (sale > cashToday())
      throw new Error("A data da venda não pode ser futura.");
    const account = await cashAccount(db, ctx, accountId, day, true);
    const totals = parts.reduce(
      (v, p) => ({
        net: v.net + Number(p.net),
        gross: v.gross + Number(p.gross),
        fee: v.fee + Number(p.fee),
      }),
      { net: 0, gross: 0, fee: 0 },
    );
    const paidAt = day + "T12:00:00-03:00";
    await db
      .prepare(
        "UPDATE payment_installments SET status='paid',paid_at=? WHERE tenant_id=? AND receivable_id=? AND status='open'",
      )
      .run(paidAt, ctx.tenantId, record);
    // One settlement represents the remaining card total; the installments remain visible.
    const first = String(parts[0].id);
    await db
      .prepare(
        "INSERT INTO cash_entries(id,tenant_id,receivable_id,installment_id,amount,gross_amount,fee_amount,method,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id(),
        ctx.tenantId,
        record,
        first,
        totals.net,
        totals.gross,
        totals.fee,
        receivable.method,
        paidAt,
      );
    await db
      .prepare(
        "UPDATE receivables SET status='paid',paid_at=?,due_on=?,card_sale_on=? WHERE tenant_id=? AND id=?",
      )
      .run(paidAt, day, sale, ctx.tenantId, record);
    const order = await db
      .prepare("SELECT number FROM orders WHERE tenant_id=? AND id=?")
      .get(ctx.tenantId, receivable.order_id);
    await recordCash(db, ctx, account, {
      day,
      amount: totals.net,
      gross_amount: totals.gross,
      fee_amount: totals.fee,
      description:
        "Recebimento OS #" +
        order?.number +
        " · cartão de crédito (" +
        parts.length +
        " parcelas)",
      method: receivable.method,
      origin: "receipt",
      source_id: first,
    });
    await audit(db, ctx, "payment.credit_received", record);
    return { ok: true, settlement_on: day, net: totals.net };
  });
}

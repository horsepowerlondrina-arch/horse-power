import { transaction, type DB } from "../db/database";
import type { Context } from "../auth/session";
import { calculatePlan, type PaymentInput } from "../domain/payments";
import { id, scoped, audit } from "./workshop";
export function requireAdmin(ctx: Context) {
  if (ctx.role !== "owner")
    throw Object.assign(new Error("Esta ação é exclusiva do administrador."), {
      status: 403,
    });
}
export function configurePlan(
  db: DB,
  ctx: Context,
  record: string,
  input: PaymentInput,
) {
  requireAdmin(ctx);
  return transaction(db, () => {
    const r = scoped(db, "receivables", ctx.tenantId, record);
    if (
      r.status === "paid" ||
      db
        .prepare(
          "SELECT 1 FROM payment_installments WHERE tenant_id=? AND receivable_id=? AND status='paid'",
        )
        .get(ctx.tenantId, record)
    )
      throw new Error("O plano não pode mudar após um recebimento.");
    const plan = calculatePlan(r.amount, input);
    db.prepare(
      "DELETE FROM payment_installments WHERE tenant_id=? AND receivable_id=?",
    ).run(ctx.tenantId, record);
    for (const part of plan.installments)
      db.prepare(
        "INSERT INTO payment_installments(id,tenant_id,receivable_id,sequence,due_on,principal,interest,gross,fee,net,method) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
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
    db.prepare(
      "UPDATE receivables SET plan_configured=1,installment_count=?,card_fee_bps=?,interest_bps=?,gross_total=?,fee_total=?,net_total=?,method=?,due_on=? WHERE tenant_id=? AND id=?",
    ).run(
      input.installments,
      input.card_fee_bps,
      input.interest_bps,
      plan.gross,
      plan.fee,
      plan.net,
      input.method,
      input.first_due_on,
      ctx.tenantId,
      record,
    );
    audit(db, ctx, "payment.plan_configured", record);
    return plan;
  });
}
export function settleInstallment(db: DB, ctx: Context, record: string) {
  requireAdmin(ctx);
  return transaction(db, () => {
    const part = scoped(db, "payment_installments", ctx.tenantId, record);
    if (part.status !== "open")
      throw new Error("Esta parcela já foi recebida.");
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE payment_installments SET status='paid',paid_at=? WHERE tenant_id=? AND id=?",
    ).run(now, ctx.tenantId, record);
    db.prepare(
      "INSERT INTO cash_entries(id,tenant_id,receivable_id,installment_id,amount,gross_amount,fee_amount,method) VALUES(?,?,?,?,?,?,?,?)",
    ).run(
      id(),
      ctx.tenantId,
      part.receivable_id,
      record,
      part.net,
      part.gross,
      part.fee,
      part.method,
    );
    const pending = db
      .prepare(
        "SELECT COUNT(*) n FROM payment_installments WHERE tenant_id=? AND receivable_id=? AND status='open'",
      )
      .get(ctx.tenantId, part.receivable_id)!.n;
    db.prepare(
      "UPDATE receivables SET status=?,paid_at=? WHERE tenant_id=? AND id=?",
    ).run(
      pending ? "open" : "paid",
      pending ? null : now,
      ctx.tenantId,
      part.receivable_id,
    );
    if (pending)
      db.prepare(
        "UPDATE receivables SET due_on=(SELECT MIN(due_on) FROM payment_installments WHERE tenant_id=? AND receivable_id=? AND status='open') WHERE tenant_id=? AND id=?",
      ).run(ctx.tenantId, part.receivable_id, ctx.tenantId, part.receivable_id);
    audit(db, ctx, "payment.installment_paid", record);
  });
}

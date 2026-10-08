import { NumericInput } from "../components/NumericInput";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../lib/context";
import { send } from "../lib/api";
import { money, today, dateLabel, type Entity } from "../lib/types";
import { PageHeading, Field, Empty, Modal } from "../components/ui";
const methods = [
  "Pix",
  "Dinheiro",
  "Cartão de débito",
  "Cartão de crédito",
  "Transferência",
  "Boleto",
];
export function Payment() {
  const { id } = useParams();
  const { data, refresh, notify } = useApp();
  const navigate = useNavigate();
  const r = data.receivables.find((r) => r.order_id === id);
  const [form, setForm] = useState({
    method: "Pix",
    installments: 1,
    card_fee_bps: 0,
    interest_bps: 0,
    first_due_on: today(),
    pass_card_fee: false,
  });
  const [accountId, setAccountId] = useState("");
  const cashAccounts = (data.cash_accounts || []).filter((a) => a.active);
  const [preview, setPreview] = useState<Entity | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<Entity | null>(null);
  useEffect(() => {
    if (!r || r.plan_configured) return;
    let current = true;
    setPreview(null);
    const timer = setTimeout(() => {
      send(`/receivables/${r.id}/preview`, form)
        .then((p) => {
          if (current) {
            setPreview(p);
            setError("");
          }
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [r?.id, r?.plan_configured, form]);
  if (!r)
    return (
      <Empty
        title="Nenhum valor a receber"
        description="Esta OS ainda não foi finalizada ou não possui saldo para cobrança."
        action={
          <button className="button" onClick={() => navigate(`/ordens/${id}`)}>
            Voltar à OS
          </button>
        }
      />
    );
  const parts = data.installments
    .filter((p) => p.receivable_id === r.id)
    .sort((a, b) => a.sequence - b.sequence);
  const plan = r.plan_configured
    ? {
        base: r.amount,
        interest: Math.round((r.amount * r.interest_bps) / 10000),
        surcharge:
          r.gross_total -
          r.amount -
          Math.round((r.amount * r.interest_bps) / 10000),
        gross: r.gross_total,
        fee: r.fee_total,
        net: r.net_total,
      }
    : preview;
  const card = form.method.startsWith("Cartão"),
    canSplit = ["Cartão de crédito", "Boleto"].includes(form.method);
  const changeMethod = (method: string) =>
    setForm((f) => ({
      ...f,
      method,
      pass_card_fee: method.startsWith("Cartão"),
      installments: 1,
      interest_bps: 0,
      card_fee_bps:
        method === "Cartão de crédito"
          ? data.payment_settings?.credit_fee_bps || 0
          : method === "Cartão de débito"
            ? data.payment_settings?.debit_fee_bps || 0
            : 0,
    }));
  return (
    <>
      <button className="back-link" onClick={() => navigate(`/ordens/${id}`)}>
        ← Voltar à OS
      </button>
      <PageHeading
        eyebrow="RECEBIMENTO"
        title={`Receber OS #${r.order_number}`}
        description={r.customer_name}
      />
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {!r.plan_configured && (
        <section className="panel work-order-section">
          <h2>Condições de pagamento</h2>
          {card && (
            <label className="import-note">
              <input
                type="checkbox"
                checked={form.pass_card_fee}
                onChange={(e) =>
                  setForm({ ...form, pass_card_fee: e.target.checked })
                }
              />{" "}
              Repassar a taxa do cartão ao cliente, preservando o líquido da
              oficina
            </label>
          )}
          <div className="form-grid">
            <Field label="Forma de pagamento">
              <select
                value={form.method}
                onChange={(e) => changeMethod(e.target.value)}
              >
                {methods.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Parcelas">
              <NumericInput
                type="number"
                min={1}
                max={form.method === "Cartão de crédito" ? 12 : 24}
                disabled={!canSplit}
                value={form.installments}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    installments: Number(e.target.value),
                    card_fee_bps:
                      data.card_rates?.find(
                        (r) =>
                          r.method === f.method &&
                          r.installments === Number(e.target.value),
                      )?.fee_bps ?? f.card_fee_bps,
                    interest_bps:
                      Number(e.target.value) > 1
                        ? data.payment_settings?.interest_bps || 0
                        : 0,
                  }))
                }
              />
            </Field>
            <Field label="Primeiro vencimento">
              <input
                type="date"
                value={form.first_due_on}
                onChange={(e) =>
                  setForm({ ...form, first_due_on: e.target.value })
                }
              />
            </Field>
            <Field label="Taxa da operadora — custo da oficina (%)">
              <NumericInput
                type="number"
                min={0}
                max={100}
                step="0.01"
                disabled={!card}
                value={form.card_fee_bps / 100}
                onChange={(e) =>
                  setForm({
                    ...form,
                    card_fee_bps: Math.round(Number(e.target.value) * 100),
                  })
                }
              />
            </Field>
            <Field label="Juros totais do parcelamento — cliente (%)">
              <NumericInput
                type="number"
                min={0}
                max={100}
                step="0.01"
                disabled={form.installments < 2}
                value={form.interest_bps / 100}
                onChange={(e) =>
                  setForm({
                    ...form,
                    interest_bps: Math.round(Number(e.target.value) * 100),
                  })
                }
              />
            </Field>
          </div>
          <p className="muted">
            Os juros são aplicados uma vez sobre o valor da OS. A taxa da
            operadora é descontada do total cobrado do cliente.
          </p>
        </section>
      )}
      {plan && (
        <section className="panel work-order-section">
          <h2>Resumo do recebimento</h2>
          <div className="payment-summary">
            {[
              ["Valor da OS", plan.base],
              ["Juros do cliente", plan.interest],
              ["Repasse do cartão", plan.surcharge || 0],
              ["Total do cliente", plan.gross],
              ["Taxa da oficina", plan.fee],
              ["Líquido da oficina", plan.net],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <span>{label}</span>
                <strong>{money(Number(value))}</strong>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="panel work-order-section">
        <h2>
          {r.status === "paid"
            ? "Recebimento concluído"
            : "Parcelas e vencimentos"}
        </h2>
        {!!r.plan_configured && (
          <p>
            {r.method} · Saldo do cliente: <strong>{money(r.balance)}</strong>
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Parcela</th>
                <th>Vencimento</th>
                <th>Cliente paga</th>
                <th>Taxa</th>
                <th>Líquido</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {(r.plan_configured ? parts : preview?.installments || []).map(
                (p: Entity) => (
                  <tr key={p.sequence}>
                    <td>
                      {p.sequence}/
                      {r.plan_configured
                        ? r.installment_count
                        : form.installments}
                    </td>
                    <td>{dateLabel(p.due_on)}</td>
                    <td>{money(p.gross)}</td>
                    <td>{money(p.fee)}</td>
                    <td>{money(p.net)}</td>
                    <td>
                      {r.plan_configured ? (
                        p.status === "paid" ? (
                          <span className="badge paid">Recebida</span>
                        ) : (
                          <button
                            className="button primary"
                            disabled={busy}
                            onClick={() => setConfirm(p)}
                          >
                            Receber parcela
                          </button>
                        )
                      ) : (
                        "Prevista"
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        {!r.plan_configured && (
          <button
            className="button primary"
            disabled={busy || !preview}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await send(`/receivables/${r.id}/plan`, form);
                await refresh();
                notify(
                  "Condições salvas. Confirme as parcelas conforme receber.",
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Salvar condições de pagamento
          </button>
        )}
      </section>
      {confirm && (
        <Modal
          title={`Confirmar recebimento da parcela ${confirm.sequence}?`}
          description={`Cliente paga ${money(confirm.gross)}. O caixa receberá ${money(confirm.net)}, após ${money(confirm.fee)} de taxa.`}
          onClose={() => !busy && setConfirm(null)}
        >
          {!!data.cash_accounts?.length && (
            <div className="modal-body">
              <Field label="Conta que recebe o valor líquido">
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                >
                  <option value="">Selecione a conta</option>
                  {cashAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ·{" "}
                      {a.kind === "cash" ? "Dinheiro físico" : "Conta bancária"}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <div className="modal-footer">
            <button
              className="button"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Voltar
            </button>
            <button
              className="button primary"
              disabled={busy || (!!data.cash_accounts?.length && !accountId)}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await send(`/installments/${confirm.id}/settle`, {
                    account_id: accountId || undefined,
                  });
                  await refresh();
                  setConfirm(null);
                  notify("Parcela recebida e caixa atualizado.");
                } catch (e) {
                  setError((e as Error).message);
                  setConfirm(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirmar recebimento
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

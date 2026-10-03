import { ShareOrder } from "../components/ShareOrder";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../lib/context";
import { send } from "../lib/api";
import { money, dateLabel } from "../lib/types";
import { displayStatus } from "../lib/workflow";
import { PageHeading, Badge, Empty, Modal, Field } from "../components/ui";
export function OrderView() {
  const { id } = useParams();
  const { data, session, refresh, notify } = useApp();
  const navigate = useNavigate();
  const order = data.orders.find((o) => o.id === id);
  const admin = session.role === "owner";
  const [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editingNotes, setEditingNotes] = useState(false),
    [notes, setNotes] = useState("");
  if (!order) return <Empty title="Atendimento não encontrado" />;
  const editable = ["quote", "open", "working", "ready"].includes(order.status);
  const next: Record<string, [string, string]> = {
    quote: ["open", "Aprovar orçamento"],
    open: ["working", "Iniciar execução"],
    working: ["ready", "Marcar como pronta"],
    ready: ["completed", "Finalizar OS e receber"],
  };
  const action = next[order.status];
  async function transition() {
    setBusy(true);
    setError("");
    try {
      await send(`/orders/${id}/status`, { status: confirm });
      await refresh();
      setConfirm("");
      notify("Situação atualizada.");
      if (confirm === "completed") navigate(`/ordens/${id}/receber`);
    } catch (e) {
      setError((e as Error).message);
      setConfirm("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="back-link no-print"
        onClick={() =>
          navigate(order.kind === "quote" ? "/orcamentos" : "/ordens")
        }
      >
        ← Voltar à lista
      </button>
      <div className="print-only">
        <h2>{session.tenant.name}</h2>
        <p>
          {session.tenant.address} · {session.tenant.phone}
        </p>
      </div>
      <PageHeading
        eyebrow={order.kind === "quote" ? "ORÇAMENTO" : "ORDEM DE SERVIÇO"}
        title={`#${order.number} · ${order.plate || "Sem placa"}`}
        description={`${order.customer_name} · ${[order.brand, order.model].filter(Boolean).join(" ") || "Veículo não informado"}`}
        actions={
          <div className="no-print action-row">
            {admin && <ShareOrder order={order} />}
            <button className="button" onClick={() => window.print()}>
              Imprimir / PDF
            </button>
            {admin && editable && (
              <button
                className="button"
                onClick={() => navigate(`/ordens/${id}/editar`)}
              >
                Editar atendimento
              </button>
            )}
            {action && (admin || ["working", "ready"].includes(action[0])) && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => setConfirm(action[0])}
              >
                {action[1]}
              </button>
            )}
            {admin && order.status === "completed" && order.receivable_id && (
              <button
                className="button primary"
                onClick={() => navigate(`/ordens/${id}/receber`)}
              >
                {order.payment_status === "paid"
                  ? "Ver recebimento"
                  : "Receber OS"}
              </button>
            )}
          </div>
        }
      />
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {order.source && (
        <p className="import-note">
          Histórico importado · {order.source}. Pagamento não conciliado; sem
          movimentação no caixa atual.
        </p>
      )}
      <div className="work-order-meta panel">
        <Badge status={displayStatus(order)} />
        <span>
          Entrada: <strong>{dateLabel(order.entered_on)}</strong>
        </span>
        <span>
          Entrega: <strong>{dateLabel(order.due_on)}</strong>
        </span>
        <span>
          <strong>
            {order.source && !order.km
              ? "Não informado"
              : order.km.toLocaleString("pt-BR")}
          </strong>{" "}
          km
        </span>
        {admin && (
          <span>
            Total: <strong>{money(order.total)}</strong>
          </span>
        )}
      </div>
      <section className="panel work-order-section">
        <h2>Relato do cliente</h2>
        <p className="preserve-lines">
          {order.problem || "Nenhum relato informado."}
        </p>
      </section>
      <div className="work-order-grid">
        {[
          ["service", "Serviços"],
          ["product", "Produtos e peças"],
        ].map(([kind, title]) => (
          <section key={kind} className="panel work-order-section">
            <h2>
              {title}{" "}
              <small>{order.items.filter((i) => i.kind === kind).length}</small>
            </h2>
            {order.items
              .filter((i) => i.kind === kind)
              .map((i) => (
                <div className="work-order-line" key={i.id}>
                  <b className="quantity-pill">{i.quantity}×</b>
                  <div>
                    <strong>{i.name}</strong>
                    {i.professional_name && (
                      <small>{i.professional_name}</small>
                    )}
                  </div>
                  {admin && <span>{money(i.quantity * i.price)}</span>}
                </div>
              ))}
            {!order.items.some((i) => i.kind === kind) && (
              <p className="muted">Nenhum item informado.</p>
            )}
          </section>
        ))}
      </div>
      <section className="panel work-order-section">
        <div className="section-heading">
          <h2>Observações para a equipe</h2>
          {order.kind === "order" && editable && (
            <button
              className="text-button no-print"
              onClick={() => {
                setNotes(order.notes);
                setEditingNotes(true);
              }}
            >
              Editar observações
            </button>
          )}
        </div>
        <p className="preserve-lines">
          {order.notes || "Nenhuma observação adicional."}
        </p>
      </section>
      {admin && editable && (
        <button
          className="text-button danger no-print"
          onClick={() => setConfirm("cancelled")}
        >
          Cancelar {order.kind === "quote" ? "orçamento" : "OS"}
        </button>
      )}
      {confirm && (
        <Modal
          title={
            confirm === "cancelled"
              ? "Cancelar atendimento?"
              : action?.[1] || "Atualizar situação"
          }
          description={
            confirm === "completed"
              ? "As peças serão baixadas do estoque e você seguirá para o recebimento."
              : confirm === "cancelled"
                ? "O registro será preservado e poderá ser encontrado pelo filtro de cancelados."
                : "Confirme para avançar o atendimento."
          }
          onClose={() => !busy && setConfirm("")}
        >
          <div className="modal-footer">
            <button
              className="button"
              disabled={busy}
              onClick={() => setConfirm("")}
            >
              Voltar
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={transition}
            >
              {busy ? "Processando..." : "Confirmar"}
            </button>
          </div>
        </Modal>
      )}
      {editingNotes && (
        <Modal
          title="Observações para a equipe"
          onClose={() => !busy && setEditingNotes(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await send(`/orders/${id}/notes`, { notes }, "PATCH");
                await refresh();
                setEditingNotes(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="modal-body">
              <Field label="Observações">
                <textarea
                  rows={8}
                  maxLength={4000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
              {error && (
                <div className="error-box" role="alert">
                  {error}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="button primary" disabled={busy}>
                Salvar observações
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

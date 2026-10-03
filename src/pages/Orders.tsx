import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Download, SlidersHorizontal } from "lucide-react";
import { useApp } from "../lib/context";
import { money, statusLabel } from "../lib/types";
import { PageHeading, SearchBox } from "../components/ui";
import { filterOrders, displayStatus } from "../lib/workflow";
import { OrderTable } from "../components/OrderTable";
export function Orders({ quotes = false }: { quotes?: boolean }) {
  const { data, notify, session } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const status = params.get("status") || (quotes ? "all" : "active");
  const rows = filterOrders(data.orders, quotes, status).filter(
    (o) =>
      (!from || o.entered_on >= from) &&
      (!to || o.entered_on <= to) &&
      `${o.number} ${o.customer_name} ${o.plate} ${o.brand} ${o.model}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const exportCSV = () => {
    const escape = (v: any) =>
      `"${String(v)
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""')}"`;
    const content = [
      [
        "Número",
        "Cliente",
        "Placa",
        "Entrada",
        "Previsão",
        "Situação",
        "Valor (R$)",
      ],
      ...rows.map((o) => [
        o.number,
        o.customer_name,
        o.plate,
        o.entered_on,
        o.due_on,
        statusLabel[displayStatus(o)],
        (o.total / 100).toFixed(2),
      ]),
    ]
      .map((r) => r.map(escape).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `horse-power-${quotes ? "orcamentos" : "ordens"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Consulta exportada em CSV.");
  };
  return (
    <>
      <PageHeading
        eyebrow="OPERAÇÃO"
        title={quotes ? "Orçamentos" : "Ordens de serviço"}
        description={
          quotes
            ? "Da primeira conversa à aprovação. Tudo em um só lugar."
            : "Do diagnóstico à entrega, acompanhe cada atendimento."
        }
        actions={
          session.role === "owner" ? (
            <>
              <button className="button" onClick={exportCSV}>
                <Download size={17} />
                Exportar
              </button>
              <button
                className="button primary"
                onClick={() =>
                  navigate(quotes ? "/orcamentos/novo" : "/ordens/nova")
                }
              >
                <Plus size={18} />
                {quotes ? "Novo orçamento" : "Nova ordem de serviço"}
              </button>
            </>
          ) : undefined
        }
      />
      <section className="panel">
        <div className="table-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Buscar cliente, placa ou número..."
          />
          {
            <select
              aria-label="Filtrar situação"
              value={status}
              onChange={(e) => setParams({ status: e.target.value })}
            >
              {!quotes && (
                <option value="active">
                  {session.role === "owner"
                    ? "Em andamento e a receber"
                    : "Em andamento"}
                </option>
              )}
              <option value="all">Todas as situações</option>
              {(quotes
                ? ["quote", "cancelled"]
                : [
                    "open",
                    "working",
                    "ready",
                    "awaiting_payment",
                    "completed",
                    "cancelled",
                  ]
              )
                .filter(
                  (s) => session.role === "owner" || s !== "awaiting_payment",
                )
                .map((s) => (
                  <option key={s} value={s}>
                    {statusLabel[s]}
                  </option>
                ))}
            </select>
          }
          <div className="date-filter">
            <SlidersHorizontal size={16} />
            <input
              type="date"
              aria-label="Entrada a partir de"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span>até</span>
            <input
              type="date"
              aria-label="Entrada até"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <OrderTable orders={rows} />
        <div className="panel-foot">
          <span>
            {rows.length} {quotes ? "orçamentos" : "ordens de serviço"}
          </span>
          {session.role === "owner" && (
            <span>
              Total da consulta{" "}
              <strong>{money(rows.reduce((s, o) => s + o.total, 0))}</strong>
            </span>
          )}
        </div>
      </section>
    </>
  );
}

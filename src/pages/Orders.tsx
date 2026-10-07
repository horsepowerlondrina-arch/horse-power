import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Download, SlidersHorizontal } from "lucide-react";
import { useApp } from "../lib/context";
import { money, statusLabel } from "../lib/types";
import { PageHeading, SearchBox } from "../components/ui";
import { filterOrders, displayStatus } from "../lib/workflow";
import { OrderTable } from "../components/OrderTable";
import { OrderResultReport } from "../components/OrderResultReport";
import {
  dateBasisLabel,
  orderResult,
  selectReportOrders,
  type OrderFilters,
} from "../lib/orderReports";
export function Orders({ quotes = false }: { quotes?: boolean }) {
  const { data, notify, session } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const status = params.get("status") || (quotes ? "all" : "active");
  const initialStatuses =
    status === "all"
      ? []
      : status === "active"
        ? [
            "open",
            "working",
            "ready",
            ...(session.role === "owner" ? ["awaiting_payment"] : []),
          ]
        : status.split(",");
  const requestedBasis = params.get("basis");
  const filters: OrderFilters = {
    from: params.get("from") || "",
    to: params.get("to") || "",
    basis:
      requestedBasis === "completion"
        ? "completion"
        : requestedBasis === "payment" && session.role === "owner"
          ? "payment"
          : "opening",
    statuses: initialStatuses,
  };
  const [draft, setDraft] = useState(filters);
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setDraft(JSON.parse(filterKey) as OrderFilters);
  }, [filterKey]);
  const [showReport, setShowReport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const rows = quotes
    ? filterOrders(data.orders, true, status).filter(
        (o) =>
          (!from || o.entered_on >= from) &&
          (!to || o.entered_on <= to) &&
          `${o.number} ${o.customer_name} ${o.plate} ${o.brand} ${o.model}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
    : selectReportOrders(data.orders, filters, data, search);
  const results = showReport ? rows.map((o) => orderResult(o, data)) : [];
  const exportExcel = async () => {
    setExporting(true);
    try {
      const { downloadResults } = await import("../lib/reportWorkbook");
      downloadResults(
        rows.map((o) => orderResult(o, data)),
        filters,
        search,
        session.tenant.name,
      );
      notify("Relatório exportado em Excel.");
    } catch {
      notify("Não foi possível exportar o relatório. Tente novamente.");
    } finally {
      setExporting(false);
    }
  };
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
    <div className="orders-list-page">
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
              <button
                className="button"
                onClick={quotes ? exportCSV : () => setShowReport(true)}
                disabled={!quotes && !rows.length}
              >
                <Download size={17} />
                {quotes ? "Exportar" : "Relatório PDF / Excel"}
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
          {quotes && (
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
          )}
          {quotes && (
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
          )}
        </div>
        {!quotes && (
          <form
            className="order-report-filters"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.from && draft.to && draft.from > draft.to) {
                notify(
                  "A data inicial deve ser anterior ou igual à data final.",
                );
                return;
              }
              setParams({
                status: draft.statuses.length
                  ? draft.statuses.join(",")
                  : "all",
                basis: draft.basis,
                from: draft.from,
                to: draft.to,
              });
            }}
          >
            <div className="report-filter-dates">
              <label className="field">
                <span>Filtrar período por</span>
                <select
                  value={draft.basis}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      basis: e.target.value as OrderFilters["basis"],
                    })
                  }
                >
                  {Object.entries(dateBasisLabel)
                    .filter(
                      ([key]) => session.role === "owner" || key !== "payment",
                    )
                    .map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span>De</span>
                <input
                  type="date"
                  value={draft.from}
                  onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Até</span>
                <input
                  type="date"
                  min={draft.from}
                  value={draft.to}
                  onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                />
              </label>
            </div>
            <fieldset className="report-statuses">
              <legend>Situação da OS</legend>
              <label>
                <input
                  type="checkbox"
                  checked={!draft.statuses.length}
                  onChange={() => setDraft({ ...draft, statuses: [] })}
                />{" "}
                Todas
              </label>
              {[
                "open",
                "working",
                "ready",
                "awaiting_payment",
                "completed",
                "cancelled",
              ]
                .filter(
                  (s) => session.role === "owner" || s !== "awaiting_payment",
                )
                .map((s) => (
                  <label key={s}>
                    <input
                      type="checkbox"
                      checked={draft.statuses.includes(s)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          statuses: e.target.checked
                            ? [...draft.statuses, s]
                            : draft.statuses.filter((v) => v !== s),
                        })
                      }
                    />
                    {statusLabel[s]}
                  </label>
                ))}
            </fieldset>
            <div className="report-actions">
              <button type="submit" className="button primary">
                Aplicar filtros
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  const cleared: OrderFilters = {
                    from: "",
                    to: "",
                    basis: "opening",
                    statuses: [],
                  };
                  setDraft(cleared);
                  setSearch("");
                  setParams({ status: "all" });
                }}
              >
                Limpar filtros
              </button>
            </div>
            {filters.basis === "payment" && (
              <p className="report-explanation">
                Seleciona cada OS com pagamento realizado no período uma única
                vez. O relatório apresenta o resultado completo da OS.
              </p>
            )}
          </form>
        )}
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
      {showReport && session.role === "owner" && (
        <OrderResultReport
          results={results}
          filters={filters}
          search={search}
          company={session.tenant.name}
          onClose={() => setShowReport(false)}
          onExcel={() => {
            if (!exporting) void exportExcel();
          }}
          exporting={exporting}
        />
      )}
    </div>
  );
}

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./ui";
import { money, dateLabel } from "../lib/types";
import type { CashReport as Report } from "../lib/cashReports";
export function CashReportContent({
  report,
  company,
}: {
  report: Report;
  company: string;
}) {
  return (
    <div className="os-result-content">
      <h1>Controle de caixa</h1>
      <p>{company}</p>
      <p>
        {dateLabel(report.filters.from)} até {dateLabel(report.filters.to)} ·{" "}
        {report.accounts.map((a) => a.name).join(", ")}
      </p>
      <div className="report-summary">
        {[
          ["Saldo inicial", report.initial],
          ["Saldos cadastrados no período", report.openings],
          ["Entradas líquidas", report.entries],
          ["Saídas", report.exits],
          ["Saldo final", report.closing],
        ].map(([label, value]) => (
          <span key={String(label)}>
            {label}
            <b>{money(Number(value))}</b>
          </span>
        ))}
      </div>
      <p className="report-explanation">
        O saldo inicial é o saldo anterior à data escolhida. Implantações de
        contas dentro do período aparecem separadamente e não são receita.
        Recebimentos entram líquidos de taxas. Contas previstas ou ainda não
        pagas não alteram o saldo. Ajustes de saldo aparecem identificados no
        histórico.
      </p>
      <div className="report-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Conta</th>
              <th>Descrição</th>
              <th>Forma</th>
              <th>Entrada / saída</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((m) => (
              <tr key={m.id}>
                <td>{dateLabel(m.day)}</td>
                <td>{m.account_name}</td>
                <td>
                  {m.description}
                  {m.fee_amount > 0 && (
                    <small className="cell-secondary">
                      Bruto {money(m.gross_amount)} · taxa {money(m.fee_amount)}
                    </small>
                  )}
                </td>
                <td>{m.method}</td>
                <td>{money(m.amount)}</td>
                <td>{money(m.balance)}</td>
              </tr>
            ))}
            {!report.rows.length && (
              <tr>
                <td colSpan={6}>Nenhum movimento neste período.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export function CashReport({
  report,
  company,
  onClose,
  onExcel,
  exporting,
}: {
  report: Report;
  company: string;
  onClose: () => void;
  onExcel: () => void;
  exporting: boolean;
}) {
  useEffect(() => {
    document.body.classList.add("printing-os-results");
    return () => document.body.classList.remove("printing-os-results");
  }, []);
  return (
    <>
      <Modal
        wide
        title="Relatório de controle de caixa"
        description="Confira os saldos e movimentos do período."
        onClose={onClose}
      >
        <div className="modal-body">
          <div className="report-actions">
            <button className="button primary" onClick={() => window.print()}>
              Imprimir / salvar PDF
            </button>
            <button className="button" disabled={exporting} onClick={onExcel}>
              {exporting ? "Gerando Excel..." : "Baixar Excel (.xlsx)"}
            </button>
          </div>
          <CashReportContent report={report} company={company} />
        </div>
      </Modal>
      {createPortal(
        <div className="os-results-print">
          <CashReportContent report={report} company={company} />
        </div>,
        document.body,
      )}
    </>
  );
}

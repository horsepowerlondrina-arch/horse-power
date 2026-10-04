import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../lib/context";
import { money, today } from "../lib/types";
import { revenueBreakdown, workshopDate } from "../lib/workflow";
import { PageHeading, Stat, Field, Empty } from "../components/ui";
import { FinanceNav } from "./Expenses";
import { Package, Wallet } from "lucide-react";
export function PartsProfit() {
  const { data } = useApp();
  const [from, setFrom] = useState(today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today());
  const totals = revenueBreakdown(data.orders, from, to);
  const orders = data.orders.filter(
    (o) =>
      o.kind === "order" &&
      o.status === "completed" &&
      workshopDate(o.completed_on || "") >= from &&
      workshopDate(o.completed_on || "") <= to &&
      o.items.some((i) => i.kind === "product"),
  );
  return (
    <>
      <FinanceNav />
      <PageHeading
        eyebrow="FINANCEIRO"
        title="Lucro das peças"
        description="Vendas das OS finalizadas, com desconto proporcional e custo registrado no atendimento."
      />
      <div className="stats-grid three">
        <Stat
          detail="OS finalizadas no período"
          label="Faturamento de peças"
          value={money(totals.products)}
          icon={<Package />}
        />
        <Stat
          detail="OS finalizadas no período"
          label="Custo das peças"
          value={money(totals.products - totals.productProfit)}
          icon={<Wallet />}
        />
        <Stat
          detail="OS finalizadas no período"
          label="Lucro bruto das peças"
          value={money(totals.productProfit)}
          icon={<Wallet />}
        />
      </div>
      <section className="panel work-order-section">
        <div className="form-grid">
          <Field label="Finalizadas de">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Até">
            <input
              type="date"
              min={from}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
        <p className="muted">
          O custo inclui o frete informado no lançamento. Lucro bruto antes de
          taxas de cartão e despesas fixas; inclui vendas ainda a receber.
        </p>
        {orders.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>OS / peça</th>
                  <th>Quantidade</th>
                  <th>Custo unitário com frete</th>
                  <th>Venda unitária</th>
                  <th>Receita de peças / OS</th>
                  <th>Lucro bruto / OS</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const sum = revenueBreakdown([o], from, to);
                  return o.items
                    .filter((i) => i.kind === "product")
                    .map((i, n) => (
                      <tr key={i.id}>
                        <td>
                          <Link to={`/ordens/${o.id}`}>OS #{o.number}</Link>
                          <small>{i.name}</small>
                        </td>
                        <td>{i.quantity}</td>
                        <td>{money(i.cost)}</td>
                        <td>{money(i.price)}</td>
                        <td>{n === 0 ? money(sum.products) : "—"}</td>
                        <td>{n === 0 ? money(sum.productProfit) : "—"}</td>
                      </tr>
                    ));
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Nenhuma venda de peças no período" />
        )}
      </section>
    </>
  );
}

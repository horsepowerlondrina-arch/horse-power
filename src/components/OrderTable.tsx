import { ArrowUpRight, CarFront } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { money, dateLabel, initials, type Order } from "../lib/types";
import { useApp } from "../lib/context";
import { displayStatus } from "../lib/workflow";
import { Badge, Empty } from "./ui";
export function OrderTable({ orders }: { orders: Order[] }) {
  const navigate = useNavigate();
  const isAdmin = useApp().session.role === "owner";
  if (!orders.length)
    return (
      <Empty
        title="Nenhuma ordem por aqui"
        description="Crie uma ordem ou ajuste os filtros para começar."
      />
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Ordem / cliente</th>
            <th>Veículo</th>
            <th>Previsão de entrega</th>
            <th>Situação</th>
            {isAdmin && <th className="align-right">Valor</th>}
            <th>
              <span className="sr-only">Abrir</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <div className="person-cell">
                  <span className="avatar">{initials(o.customer_name)}</span>
                  <div>
                    <button
                      className="cell-link"
                      onClick={() => navigate(`/ordens/${o.id}`)}
                    >
                      #{o.number} <span>· {o.customer_name}</span>
                    </button>
                    <small>
                      {o.items
                        .filter((i) => i.kind === "service")
                        .map((i) => i.name)
                        .join(", ") || "Sem serviços adicionados"}
                    </small>
                  </div>
                </div>
              </td>
              <td>
                <div className="vehicle-cell">
                  <CarFront size={16} />
                  <div>
                    {o.brand} {o.model}
                    <small className="plate">{o.plate}</small>
                  </div>
                </div>
              </td>
              <td>
                <span className="date-cell">{dateLabel(o.due_on)}</span>
              </td>
              <td>
                <Badge status={displayStatus(o)} />
              </td>
              {isAdmin && (
                <td className="align-right money">{money(o.total)}</td>
              )}
              <td>
                <button
                  className="icon-button"
                  aria-label={`Abrir ordem ${o.number}`}
                  onClick={() => navigate(`/ordens/${o.id}`)}
                >
                  <ArrowUpRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

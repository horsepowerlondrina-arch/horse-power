import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { money, statusLabel, type Entity } from "../lib/types";
export function PublicOrder() {
  const { token } = useParams();
  const [data, setData] = useState<Entity | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    api(`/public/${token}`)
      .then((d) => {
        if (current) setData(d);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [token]);
  return (
    <main className="public-order">
      <header>
        <img src="/brand/horse-power.jpg" alt="Horse Power Car Service" />
      </header>
      {error ? (
        <section className="panel">
          <h1>{error}</h1>
          <p>Peça um novo link à oficina.</p>
        </section>
      ) : !data ? (
        <p>Carregando atendimento…</p>
      ) : (
        <>
          <section className="public-intro">
            <span className="eyebrow">
              {data.kind === "quote" ? "SEU ORÇAMENTO" : "SEU ATENDIMENTO"} · #
              {data.number}
            </span>
            <h1>Olá, {data.customer}.</h1>
            <p>
              {data.vehicle} {data.plate && `· ${data.plate}`}
            </p>
            <span className="badge">
              {statusLabel[data.status] || data.status}
            </span>
          </section>
          {["service", "product"].map((kind) => (
            <section className="panel public-items" key={kind}>
              <h2>{kind === "service" ? "Serviços" : "Peças e produtos"}</h2>
              {data.items
                .filter((i: Entity) => i.kind === kind)
                .map((i: Entity, n: number) => (
                  <div className="public-item" key={n}>
                    <div>
                      <strong>{i.name}</strong>
                      <small>
                        {i.quantity} × {money(i.price)}
                      </small>
                    </div>
                    <strong>{money(i.price * i.quantity)}</strong>
                  </div>
                ))}
              {!data.items.some((i: Entity) => i.kind === kind) && (
                <p className="muted">Nenhum item.</p>
              )}
            </section>
          ))}
          <section className="panel public-totals">
            <div>
              <span>Subtotal</span>
              <strong>{money(data.total + data.discount)}</strong>
            </div>
            {data.discount > 0 && (
              <div>
                <span>Desconto</span>
                <strong>− {money(data.discount)}</strong>
              </div>
            )}
            <div className="public-total">
              <span>Total</span>
              <strong>{money(data.total)}</strong>
            </div>
            <p>
              Condições de pagamento e eventuais acréscimos de cartão são
              combinados com a oficina.
            </p>
          </section>
          <footer>
            <strong>{data.shop.name}</strong>
            <p>{data.shop.address}</p>
            <p>{data.shop.phone}</p>
            <button className="button no-print" onClick={() => window.print()}>
              Imprimir / salvar PDF
            </button>
          </footer>
        </>
      )}
    </main>
  );
}

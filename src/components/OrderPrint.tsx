import { money, statusLabel, type Entity } from "../lib/types";

function fullDate(value?: string) {
  if (!value) return "—";
  const day = value.slice(0, 10);
  const date = new Date(day + "T12:00:00");
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("pt-BR");
}

export function OrderPrint({
  order,
  tenant,
  customer,
  vehicle,
}: {
  order: Entity;
  tenant: Entity;
  customer?: Entity;
  vehicle?: Entity;
}) {
  const items = order.items || [];
  const products = items.filter((i: Entity) => i.kind === "product");
  const services = items.filter((i: Entity) => i.kind === "service");
  const productTotal = products.reduce(
    (sum: number, item: Entity) => sum + item.price * item.quantity,
    0,
  );
  const serviceTotal = services.reduce(
    (sum: number, item: Entity) => sum + item.price * item.quantity,
    0,
  );
  const discount = Number(order.discount || 0);
  const total = productTotal + serviceTotal - discount;
  const quote = order.kind === "quote" || order.status === "quote";
  const customerName =
    customer?.name || order.customer_name || order.guest_name || "—";
  const customerPhone = customer?.phone || "—";
  const customerDocument = customer?.document || "—";
  const customerAddress = customer?.address || "—";
  const plate = vehicle?.plate || order.plate || order.guest_plate || "—";
  const vehicleLabel = vehicle
    ? [vehicle.brand, vehicle.model, vehicle.color, vehicle.year]
        .filter(Boolean)
        .join(" ")
    : order.guest_vehicle ||
      [order.brand, order.model].filter(Boolean).join(" ") ||
      "—";
  const chassis = vehicle?.chassis || "—";
  const status =
    statusLabel[order.display_status || order.status] ||
    order.display_status ||
    order.status ||
    "—";

  return (
    <section className="print-only hp-print-order">
      <header className="hp-print-header">
        <img
          className="hp-print-logo"
          src="/brand/icon.jpg"
          alt="Horse Power Car Service"
        />
        <div className="hp-print-company">
          <h1>{tenant.name}</h1>
          <p>{tenant.address || "Londrina/PR"}</p>
          <p>EMAIL: {tenant.email || "horsepowerlondrina@gmail.com"}</p>
        </div>
        <strong className="hp-print-phone">{tenant.phone || ""}</strong>
      </header>

      <div className="hp-print-titlebar">
        <strong>
          {quote ? "ORÇAMENTO Nº" : "ORDEM DE SERVIÇO Nº"}{" "}
          {order.number || "—"}
        </strong>
        <span>{fullDate(order.entered_on)}</span>
        <strong>STATUS: {String(status).toUpperCase()}</strong>
      </div>

      <section className="hp-print-customer">
        <div><b>Cliente:</b> {customerName}</div>
        <div><b>Endereço:</b> {customerAddress}</div>
        <div className="hp-print-two">
          <span><b>Telefones:</b> {customerPhone}</span>
          <span><b>Docs:</b> {customerDocument}</span>
        </div>
        <div className="hp-print-two">
          <span><b>Veículo:</b> {vehicleLabel}</span>
          <span><b>Placa:</b> {plate}</span>
        </div>
        <div className="hp-print-two">
          <span><b>KM:</b> {Number(order.km || 0).toLocaleString("pt-BR")}</span>
          <span><b>Chassi:</b> {chassis}</span>
        </div>
      </section>

      <section className="hp-print-section">
        <h2>SERVIÇOS:</h2>
        <table className="hp-print-table hp-print-services">
          <thead>
            <tr><th>Descrição</th><th>Valor</th></tr>
          </thead>
          <tbody>
            {services.length ? (
              services.map((item: Entity) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{money(item.price * item.quantity)}</td>
                </tr>
              ))
            ) : (
              <tr><td>Nenhum serviço informado.</td><td>—</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th>TOTAL SERVIÇOS:</th>
              <th>{money(serviceTotal)}</th>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="hp-print-section">
        <h2>PRODUTOS:</h2>
        <table className="hp-print-table hp-print-products">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Valor Unitário</th>
              <th>Qtde.</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {products.length ? (
              products.map((item: Entity) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{money(item.price)}</td>
                  <td>{item.quantity}</td>
                  <td>{money(item.price * item.quantity)}</td>
                </tr>
              ))
            ) : (
              <tr><td>Nenhum produto informado.</td><td>—</td><td>—</td><td>—</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th>TOTAL PRODUTOS:</th>
              <th />
              <th />
              <th>{money(productTotal)}</th>
            </tr>
          </tfoot>
        </table>
      </section>

      {(order.problem || order.notes) && (
        <section className="hp-print-notes">
          {order.problem && (
            <p><b>Relato do cliente:</b> {order.problem}</p>
          )}
          {order.notes && (
            <p><b>Observações:</b> {order.notes}</p>
          )}
        </section>
      )}

      <footer className="hp-print-footer">
        <div className="hp-print-dates">
          <p><b>DATA ENTRADA:</b> {fullDate(order.entered_on)}</p>
          <p><b>DATA FINALIZAÇÃO:</b> {fullDate(order.completed_on)}</p>
          <div className="hp-print-signature">
            <span />
            Assinatura Oficina
          </div>
          <div className="hp-print-signature">
            <span />
            Assinatura Cliente
          </div>
        </div>
        <div className="hp-print-totalbox">
          <h2>TOTAL</h2>
          <div><span>TOTAL SERVIÇOS:</span><strong>{money(serviceTotal)}</strong></div>
          <div><span>TOTAL PRODUTOS:</span><strong>{money(productTotal)}</strong></div>
          <div><span>(-) DESCONTO:</span><strong>{money(discount)}</strong></div>
          <div className="hp-print-grand-total">
            <span>TOTAL A PAGAR:</span><strong>{money(total)}</strong>
          </div>
        </div>
      </footer>
    </section>
  );
}

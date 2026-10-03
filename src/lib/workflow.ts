import type { Order } from "./types";
export const workshopDate = (timestamp: string) => {
  if (!timestamp) return "";
  const normalized = timestamp.includes("T")
    ? timestamp
    : timestamp.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};
export const displayStatus = (order: Order) =>
  order.display_status || order.status;
export function filterOrders(orders: Order[], quotes: boolean, status: string) {
  return orders.filter(
    (o) =>
      (quotes ? o.kind === "quote" : o.kind === "order") &&
      (status === "all" ||
        (status === "active"
          ? ["open", "working", "ready", "awaiting_payment"].includes(
              displayStatus(o),
            )
          : displayStatus(o) === status)),
  );
}
export function revenueBreakdown(orders: Order[], from: string, to: string) {
  return orders
    .filter(
      (o) =>
        o.kind === "order" &&
        o.status === "completed" &&
        workshopDate(o.completed_on || "") >= from &&
        workshopDate(o.completed_on || "") <= to,
    )
    .reduce(
      (sum, o) => {
        const products = o.items.filter((i) => i.kind === "product");
        const gross = products.reduce((s, i) => s + i.price * i.quantity, 0);
        const subtotal = o.items.reduce((s, i) => s + i.price * i.quantity, 0);
        const productRevenue =
          gross - (subtotal ? Math.round((o.discount * gross) / subtotal) : 0);
        const productCost =
          o.product_cost_total ??
          products.reduce((s, i) => s + i.cost * i.quantity, 0);
        return {
          products: sum.products + productRevenue,
          services: sum.services + o.total - productRevenue,
          productProfit: sum.productProfit + productRevenue - productCost,
        };
      },
      { products: 0, services: 0, productProfit: 0 },
    );
}

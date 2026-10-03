export const statuses = [
  "quote",
  "open",
  "working",
  "ready",
  "completed",
  "cancelled",
] as const;
export type Status = (typeof statuses)[number];
export const transitions: Record<Status, Status[]> = {
  quote: ["open", "cancelled"],
  open: ["working", "cancelled"],
  working: ["ready", "cancelled"],
  ready: ["completed", "working", "cancelled"],
  completed: [],
  cancelled: [],
};
export function totalOf(
  items: { price: number; quantity: number }[],
  discount: number,
) {
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  if (!Number.isSafeInteger(subtotal) || discount > subtotal)
    throw new Error("O desconto não pode superar o valor dos itens.");
  return subtotal - discount;
}
export function assertTransition(from: Status, to: Status) {
  if (!transitions[from]?.includes(to))
    throw new Error("Esta mudança de situação não é permitida.");
}

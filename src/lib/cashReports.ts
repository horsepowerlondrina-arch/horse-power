export type CashAccount = {
  id: string;
  name: string;
  kind: "bank" | "cash";
  opening_balance: number;
  opening_on: string;
  active: number;
  balance: number;
};
export type CashMovement = {
  id: string;
  account_id: string;
  day: string;
  amount: number;
  gross_amount: number;
  fee_amount: number;
  description: string;
  method: string;
  origin: string;
  created_at?: string;
  account_name?: string;
};
export type CashFilters = { from: string; to: string; account_id: string };
export function cashReport(
  accounts: CashAccount[],
  movements: CashMovement[],
  filters: CashFilters,
) {
  if (filters.from > filters.to)
    throw new Error("A data inicial deve ser anterior ou igual à final.");
  const selected = accounts.filter(
      (a) => !filters.account_id || a.id === filters.account_id,
    ),
    ids = new Set(selected.map((a) => a.id));
  const events: CashMovement[] = [
    ...selected.map((a) => ({
      id: "opening:" + a.id,
      account_id: a.id,
      account_name: a.name,
      day: a.opening_on,
      amount: a.opening_balance,
      gross_amount: 0,
      fee_amount: 0,
      description: "Saldo inicial cadastrado",
      method: "Implantação",
      origin: "opening",
      created_at: "",
    })),
    ...movements
      .filter((m) => ids.has(m.account_id))
      .map((m) => ({
        ...m,
        account_name:
          selected.find((a) => a.id === m.account_id)?.name || m.account_name,
      })),
  ].sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      (a.created_at || "").localeCompare(b.created_at || "") ||
      a.id.localeCompare(b.id),
  );
  const initial = events
    .filter((m) => m.day < filters.from)
    .reduce((n, m) => n + m.amount, 0);
  let balance = initial,
    entries = 0,
    exits = 0,
    openings = 0;
  const rows = events
    .filter((m) => m.day >= filters.from && m.day <= filters.to)
    .map((m) => {
      balance += m.amount;
      if (m.origin === "opening") openings += m.amount;
      else if (m.amount > 0) entries += m.amount;
      else exits -= m.amount;
      return { ...m, balance };
    });
  return {
    filters,
    accounts: selected,
    initial,
    entries,
    exits,
    openings,
    closing: balance,
    rows,
  };
}
export type CashReport = ReturnType<typeof cashReport>;

/** Purchase freight proportional to cost × quantity, distributing every cent. */
export function allocateFreight(
  items: { id: string; cost: number; quantity: number }[],
  freightTotal: number,
) {
  const money = (n: number) =>
    Number.isSafeInteger(n) && n >= 0 && n <= 100000000;
  if (
    !money(freightTotal) ||
    items.some(
      (i) =>
        !money(i.cost) ||
        !Number.isSafeInteger(i.quantity) ||
        i.quantity < 1 ||
        i.quantity > 1000000,
    )
  )
    throw new Error("Revise os custos, as quantidades e o frete.");
  const rows = items.map((i) => ({
    ...i,
    basis: BigInt(i.cost) * BigInt(i.quantity),
    share: 0,
    remainder: 0n,
  }));
  const total = rows.reduce((s, r) => s + r.basis, 0n);
  if (total === 0n) {
    if (freightTotal > 0)
      throw new Error("Informe o custo dos produtos para dividir o frete.");
    return rows.map((r) => ({
      freight_total: 0,
      freight_unit: 0,
      cost: r.cost,
    }));
  }
  let distributed = 0;
  for (const r of rows) {
    const numerator = BigInt(freightTotal) * r.basis;
    r.share = Number(numerator / total);
    r.remainder = numerator % total;
    distributed += r.share;
  }
  const sorted = [...rows].sort((a, b) =>
    a.remainder === b.remainder
      ? a.id.localeCompare(b.id)
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (let i = 0; i < freightTotal - distributed; i++) sorted[i].share++;
  return rows.map((r) => {
    const freight_unit = Math.round(r.share / r.quantity);
    const cost = r.cost + freight_unit;
    if (!money(cost)) throw new Error("Custo com frete acima do limite.");
    return { freight_total: r.share, freight_unit, cost };
  });
}

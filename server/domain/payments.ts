export const paymentMethods = [
  "Pix",
  "Dinheiro",
  "Cartão de débito",
  "Cartão de crédito",
  "Transferência",
  "Boleto",
] as const;
export type PaymentInput = {
  method: string;
  installments: number;
  card_fee_bps: number;
  interest_bps: number;
  first_due_on: string;
  pass_card_fee?: boolean;
  sale_on?: string;
};
export function addMonthsClamped(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
const split = (total: number, n: number) =>
  Array.from(
    { length: n },
    (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0),
  );
export function calculatePlan(base: number, input: PaymentInput) {
  if (!Number.isSafeInteger(base) || base <= 0)
    throw new Error("Valor inválido para recebimento.");
  if (!paymentMethods.includes(input.method as any))
    throw new Error("Forma de pagamento inválida.");
  if (
    !Number.isInteger(input.installments) ||
    input.installments < 1 ||
    input.installments > 24 ||
    input.installments > base
  )
    throw new Error(
      "Escolha de 1 a 24 parcelas, com ao menos um centavo cada.",
    );
  if (
    ["Pix", "Dinheiro", "Cartão de débito", "Transferência"].includes(
      input.method,
    ) &&
    input.installments !== 1
  )
    throw new Error("Esta forma de pagamento é à vista.");
  for (const rate of [input.card_fee_bps, input.interest_bps])
    if (!Number.isInteger(rate) || rate < 0 || rate > 10000)
      throw new Error("Informe uma taxa entre 0% e 100%.");
  if (!input.method.startsWith("Cartão") && input.card_fee_bps !== 0)
    throw new Error("Taxa de cartão só se aplica a pagamentos com cartão.");
  if (input.installments === 1 && input.interest_bps !== 0)
    throw new Error(
      "Juros de parcelamento só se aplicam a pagamentos parcelados.",
    );
  const interest = Math.round((base * input.interest_bps) / 10000);
  if (
    input.pass_card_fee &&
    (!input.method.startsWith("Cartão") || input.card_fee_bps >= 10000)
  )
    throw new Error("Repasse requer cartão e taxa inferior a 100%.");
  const gross = input.pass_card_fee
    ? Math.round(((base + interest) * 10000) / (10000 - input.card_fee_bps))
    : base + interest;
  const surcharge = gross - base - interest;
  const fee = Math.round((gross * input.card_fee_bps) / 10000);
  const net = gross - fee;
  // Allocate fees against each installment's gross to avoid negative net values.
  const principals = split(base, input.installments),
    grossParts = split(gross, input.installments);
  let allocated = 0;
  const installments = principals.map((principal, index) => {
    const installmentGross = grossParts[index];
    const remainingGross = grossParts
      .slice(index + 1)
      .reduce((s, p) => s + p, 0);
    const partFee = Math.min(
      fee - allocated,
      installmentGross,
      Math.max(
        fee - allocated - remainingGross,
        index === input.installments - 1
          ? fee - allocated
          : Math.round((installmentGross * input.card_fee_bps) / 10000),
      ),
    );
    allocated += partFee;
    return {
      sequence: index + 1,
      due_on: addMonthsClamped(input.first_due_on, index),
      principal,
      interest: installmentGross - principal,
      gross: installmentGross,
      fee: partFee,
      net: installmentGross - partFee,
    };
  });
  return { base, interest, surcharge, gross, fee, net, installments };
}

export const normalizeCustomerName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
export const customerPhoneDigits = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return /^55\d{10,11}$/.test(digits) ? digits.slice(2) : digits;
};
export const validNewCustomerPhone = (value: string) =>
  /^[\d+() .-]+$/.test(value) && /^\d{10,15}$/.test(customerPhoneDigits(value));

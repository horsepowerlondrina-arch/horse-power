// National banking calendar: FEBRABAN; municipal/state holidays are not inferred.
export function nextBankingDay(day: string) {
  const date = new Date(day + "T12:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  )
    throw new Error("Data da venda inválida.");
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (isClosed(date));
  return date.toISOString().slice(0, 10);
}
function isClosed(date: Date) {
  if ([0, 6].includes(date.getUTCDay())) return true;
  const key = date.toISOString().slice(5, 10);
  if (
    [
      "01-01",
      "04-21",
      "05-01",
      "09-07",
      "10-12",
      "11-02",
      "11-15",
      "11-20",
      "12-25",
    ].includes(key)
  )
    return true;
  const year = date.getUTCFullYear(),
    a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451);
  const value = h + l - 7 * m + 114,
    month = Math.floor(value / 31),
    day = (value % 31) + 1;
  const easter = Date.UTC(year, month - 1, day, 12);
  return [-48, -47, -2, 60].some(
    (offset) =>
      new Date(easter + offset * 86400000).toISOString().slice(0, 10) ===
      date.toISOString().slice(0, 10),
  );
}

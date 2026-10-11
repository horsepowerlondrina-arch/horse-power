export type InvoiceIdentity = {
  name: string;
  brand: string;
  manufacturer_code: string;
  application: string;
};
const clean = (value: string) => value.trim().replace(/\s+/g, " ");
export const identityKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
export function invoiceIdentity(
  document: string,
  description: string,
  supplierCode: string,
): InvoiceIdentity {
  const raw = clean(description),
    fallback = { name: raw, brand: "", manufacturer_code: "", application: "" };
  let name = "",
    brand = "",
    code = "";
  if (document.startsWith("84586205")) {
    const brands = [
      "METAL LEVE",
      "GATES",
      "ELRING",
      "TARANTO",
      "SCHADEK",
      "TECFIL",
      "MAHLE",
      "RIOSUL",
      "INA",
    ];
    brand = brands.find((b) => raw.startsWith(b + " ")) || "";
    const separator = raw.indexOf(" - ");
    if (!brand || separator < 0) return fallback;
    let prefix = raw.slice(brand.length, separator).trim().split("=")[0].trim();
    const modifier = prefix.match(/\s+(STD|JG|BALANCIM|TUCHO)$/)?.[1] || "";
    if (modifier) prefix = prefix.slice(0, -modifier.length).trim();
    if (!/^[A-Z0-9.\s\/-]{1,80}$/i.test(prefix) || !/\d/.test(prefix))
      return fallback;
    code = prefix;
    name = raw.slice(separator + 3);
    const internal = supplierCode.replace(/-0$/, "");
    if (/^\d+$/.test(internal))
      name = name
        .replace(new RegExp("(?:\\s+-)?\\s+" + internal + "$"), "")
        .trim();
    if (modifier === "STD") name += " STD";
  } else if (
    document.startsWith("55847057") ||
    document.startsWith("12049403")
  ) {
    const end = raw.lastIndexOf(" - "),
      start = raw.indexOf("-");
    if (end <= start || start <= 0) return fallback;
    code = raw.slice(0, start).trim();
    name = raw.slice(start + 1, end).trim();
    brand = raw.slice(end + 3).trim();
    if (
      !/^[A-Z0-9.]{1,80}$/i.test(code) ||
      !/\d/.test(code) ||
      !/^[\p{L}\p{N}& .-]{1,100}$/u.test(brand)
    )
      return fallback;
  } else if (document.startsWith("04078311")) {
    name = raw;
  } else return fallback;
  let application = "";
  const match =
    /\s+(FIAT|GM|AUDI|VW|VOLKSWAGEN|FORD|HONDA|TOYOTA|RENAULT|PEUGEOT|CITROEN|CHEVROLET|HYUNDAI|NISSAN|MITSUBISHI|KIA|JEEP|BMW|MERCEDES)(?:\s+|$)/i.exec(
      name,
    );
  if (match) {
    application = name.slice(match.index).trim();
    name = name.slice(0, match.index).trim();
  }
  return { name: clean(name), brand, manufacturer_code: code, application };
}

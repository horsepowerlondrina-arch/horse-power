export const productLabel = (item: Record<string, any>) => [item.name, item.brand, item.manufacturer_code].filter(Boolean).join(" · ");
export const productDetails = (item: Record<string, any>) => [
 item.application && "Aplicação: " + item.application,
 item.usage_vehicles && "Utilizada em: " + String(item.usage_vehicles).replaceAll("\n", "; "),
].filter(Boolean).join(" · ");
export const categoryKey = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").toUpperCase();
export const matchesSearch = (text: string, query: string) => {
 const normalize = (value: string) => categoryKey(value);
 const terms = normalize(query).split(" ").filter(Boolean);
 const haystack = normalize(text);
 return terms.every((term) => haystack.includes(term));
};

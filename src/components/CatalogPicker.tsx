import { useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { money, type Entity } from "../lib/types";
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function CatalogPicker({
  items,
  value,
  onChange,
  kind,
  extensionOnly = false,
}: {
  items: Entity[];
  value: string;
  onChange: (id: string) => void;
  kind: string;
  extensionOnly?: boolean;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = useRef<HTMLDivElement>(null);
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const matches = items.filter((item) =>
    words.every((word) =>
      normalize(
        `${item.name} ${item.sku} ${item.category} ${item.search_aliases || ""}`,
      ).includes(word),
    ),
  );
  const selected = items.find((item) => item.id === value);
  const choose = (item: Entity) => {
    onChange(item.id);
    setOpen(false);
    setQuery("");
  };
  const move = (index: number) => {
    setActive(index);
    options.current?.children[index]?.scrollIntoView({ block: "nearest" });
  };
  return (
    <div
      className="catalog-picker"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <div className="catalog-search">
        <Search size={17} />
        <input
          role="combobox"
          aria-label={kind === "product" ? "Buscar produto" : "Buscar serviço"}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && matches[active] ? `${listId}-${active}` : undefined
          }
          autoComplete="off"
          placeholder={
            kind === "product"
              ? "Digite o nome ou código do produto…"
              : "Digite o nome ou código do serviço…"
          }
          value={open ? query : selected?.name || ""}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActive(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
            onChange("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              move(
                Math.max(
                  0,
                  Math.min(
                    matches.length - 1,
                    active + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            if (e.key === "Enter" && open) {
              e.preventDefault();
              if (matches[active]) choose(matches[active]);
            }
          }}
        />
      </div>
      {open && (
        <div className="catalog-dropdown">
          <div className="catalog-search-count" role="status">
            {matches.length} {kind === "product" ? "produtos" : "serviços"}{" "}
            encontrados
          </div>
          <div
            id={listId}
            role="listbox"
            aria-label="Resultados do catálogo"
            className="catalog-options"
            ref={options}
          >
            {matches.map((item, index) => (
              <div
                key={item.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? "active" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
                onMouseEnter={() => setActive(index)}
              >
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.sku}
                    {kind === "product"
                      ? ` · ${item.stock_verified === 0 ? "Estoque a conferir" : `${item.stock} un.`}`
                      : ""}
                  </small>
                </div>
                <b>{money(item.price)}</b>
              </div>
            ))}
          </div>
          {!matches.length && (
            <p className="catalog-no-results">
              {extensionOnly
                ? "Nenhum item encontrado. Envie pela extensão dentro de um orçamento para começar seu catálogo."
                : "Nenhum item encontrado. Tente outro termo ou cadastre abaixo."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

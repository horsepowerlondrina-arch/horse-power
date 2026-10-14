import { useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useApp } from "../lib/context";
import { send } from "../lib/api";
import { money } from "../lib/types";
import { allocateFreight } from "../../shared/freight";
import { salePrice } from "../../shared/pricing";
import { Modal, Field } from "./ui";
import { NumericInput } from "./NumericInput";
type ProductDraft = {
  id: string;
  name: string;
  sku: string;
  brand: string;
  manufacturer_code: string;
  application: string;
  category: string;
  cost: number;
  quantity: number;
};
const newProduct = (): ProductDraft => ({
  id: crypto.randomUUID(),
  name: "",
  sku: `HP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
  brand: "",
  manufacturer_code: "",
  application: "",
  category: "",
  cost: 0,
  quantity: 1,
});
export function ProductBatch({ onClose }: { onClose: () => void }) {
  const { data, refresh, notify } = useApp();
  const requestId = useRef(crypto.randomUUID());
  const [items, setItems] = useState<ProductDraft[]>(() => [newProduct()]);
  const [freight, setFreight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const patch = (id: string, values: Partial<ProductDraft>) =>
    setItems((old) => old.map((i) => (i.id === id ? { ...i, ...values } : i)));
  let preview: {
    freight_total: number;
    freight_unit: number;
    cost: number;
    price: number;
  }[] = [];
  let calculationError = "";
  try {
    if (!data.parts_pricing)
      throw new Error("A regra de preço de venda ainda não está disponível.");
    preview = allocateFreight(
      items.map((i, index) => ({ ...i, id: String(index).padStart(3, "0") })),
      freight,
    ).map((i) => ({ ...i, price: salePrice(i.cost, data.parts_pricing!) }));
  } catch (e) {
    calculationError = (e as Error).message;
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || calculationError) return;
    setBusy(true);
    setError("");
    try {
      const result = await send("/catalog-batch", {
        request_id: requestId.current,
        freight_total: freight,
        items: items.map(({ id, ...i }) => i),
      });
      await refresh();
      notify(`${result.count} produto(s) cadastrados.`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title="Cadastrar produtos"
      description="Monte a lista da compra e informe um único frete. O custo e o preço de venda são calculados pela regra da oficina."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="modal-body">
          <fieldset disabled={busy} className="product-batch-fields">
            <Field label="Frete total da compra (R$)">
              <NumericInput
                min={0}
                max={1000000}
                step="0.01"
                value={freight / 100}
                onChange={(e) =>
                  setFreight(Math.round(Number(e.target.value) * 100))
                }
              />
            </Field>
            <p className="muted">
              O frete é dividido proporcionalmente ao custo × quantidade de cada
              produto. A quantidade serve para o cálculo; a entrada no estoque é
              feita separadamente.
            </p>
            <div className="product-batch-list">
              {items.map((item, index) => (
                <section
                  className="product-batch-item"
                  key={item.id}
                  aria-label={`Produto ${index + 1}`}
                >
                  <div className="product-batch-heading">
                    <strong>Produto {index + 1}</strong>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={items.length === 1}
                      aria-label={`Remover produto ${index + 1}`}
                      onClick={() =>
                        setItems((old) => old.filter((i) => i.id !== item.id))
                      }
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="form-grid">
                    <Field full label="Nome do produto *">
                      <input
                        required
                        minLength={2}
                        maxLength={150}
                        value={item.name}
                        onChange={(e) =>
                          patch(item.id, { name: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Marca / fabricante">
                      <input
                        maxLength={300}
                        value={item.brand}
                        onChange={(e) =>
                          patch(item.id, { brand: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Código do fabricante">
                      <input
                        maxLength={300}
                        value={item.manufacturer_code}
                        onChange={(e) =>
                          patch(item.id, { manufacturer_code: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Referência *">
                      <input
                        required
                        maxLength={40}
                        value={item.sku}
                        onChange={(e) =>
                          patch(item.id, { sku: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Categoria">
                      <select
                        value={item.category}
                        onChange={(e) =>
                          patch(item.id, { category: e.target.value })
                        }
                      >
                        <option value="">Sem categoria</option>
                        {(data.product_categories || [])
                          .filter((c) => c.active)
                          .map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field full label="Aplicação informada pelo fabricante">
                      <input
                        maxLength={1000}
                        value={item.application}
                        onChange={(e) =>
                          patch(item.id, { application: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Quantidade na compra *">
                      <NumericInput
                        required
                        min={1}
                        max={1000000}
                        step={1}
                        value={item.quantity}
                        onChange={(e) =>
                          patch(item.id, { quantity: Number(e.target.value) })
                        }
                      />
                    </Field>
                    <Field label="Custo unitário sem frete (R$) *">
                      <NumericInput
                        required
                        min={0}
                        max={1000000}
                        step="0.01"
                        value={item.cost / 100}
                        onChange={(e) =>
                          patch(item.id, {
                            cost: Math.round(Number(e.target.value) * 100),
                          })
                        }
                      />
                    </Field>
                  </div>
                  {preview[index] && (
                    <div className="product-batch-totals">
                      <span>
                        Frete deste produto:{" "}
                        <strong>{money(preview[index].freight_total)}</strong>
                      </span>
                      <span>
                        Frete por unidade:{" "}
                        <strong>{money(preview[index].freight_unit)}</strong>
                      </span>
                      <span>
                        Custo com frete por unidade:{" "}
                        <strong>{money(preview[index].cost)}</strong>
                      </span>
                      <span>
                        Preço de venda por unidade:{" "}
                        <strong>{money(preview[index].price)}</strong>
                      </span>
                    </div>
                  )}
                </section>
              ))}
            </div>
            <button
              type="button"
              className="button"
              disabled={items.length >= 100}
              onClick={() => setItems((old) => [...old, newProduct()])}
            >
              <Plus size={17} /> Adicionar produto à lista
            </button>
          </fieldset>
          {calculationError && (
            <p className="form-error" role="alert">
              {calculationError}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <span>
            {items.length} produto(s) · Frete total: {money(freight)}
          </span>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button type="submit" className="button primary" disabled={busy || !!calculationError} aria-busy={busy}>
            {busy ? "Cadastrando..." : "Cadastrar lista de produtos"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

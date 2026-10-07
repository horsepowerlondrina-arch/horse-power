import { NumericInput } from "./NumericInput";
import { useState } from "react";
import { useApp } from "../lib/context";
import { send } from "../lib/api";
import { CatalogPicker } from "./CatalogPicker";
import { Modal, Field, Submit } from "./ui";
import { money, type Entity } from "../lib/types";
export function StockEntry({
  initial,
  onClose,
}: {
  initial?: Entity;
  onClose: () => void;
}) {
  const { data, refresh, notify } = useApp();
  const [product, setProduct] = useState(initial?.id || ""),
    [quantity, setQuantity] = useState(1),
    [cost, setCost] = useState(
      (initial?.cost || 0) - (initial?.freight_unit || 0),
    ),
    [freight, setFreight] = useState(initial?.freight_unit || 0),
    [price, setPrice] = useState(initial?.price || 0),
    [reason, setReason] = useState("Entrada de mercadoria"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const products = data.catalog.filter((p) => p.kind === "product" && p.active);
  return (
    <Modal
      title="Entrada em estoque"
      description="Confirme a quantidade recebida e os valores por unidade."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await send(`/stock/${product}`, {
              quantity,
              cost: cost + freight,
              freight_unit: freight,
              price,
              reason,
              request_id: requestId,
            });
            await refresh();
            notify("Entrada registrada e preços atualizados.");
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body form-grid">
          <Field label="Produto" full>
            <CatalogPicker
              items={products}
              kind="product"
              value={product}
              onChange={(id) => {
                setProduct(id);
                const p = products.find((x) => x.id === id)!;
                setCost(p.cost - (p.freight_unit || 0));
                setFreight(p.freight_unit || 0);
                setPrice(p.price);
              }}
            />
          </Field>
          <Field label="Quantidade recebida">
            <NumericInput
              type="number"
              min="1"
              max="100000"
              required
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </Field>
          {(
            [
              ["Custo sem frete (R$)", cost, setCost],
              ["Frete por unidade (R$)", freight, setFreight],
              ["Venda por unidade (R$)", price, setPrice],
            ] as const
          ).map(([label, value, set]) => (
            <Field key={label} label={label}>
              <NumericInput
                type="number"
                required
                min="0"
                step="0.01"
                value={value / 100}
                onChange={(e) => set(Math.round(Number(e.target.value) * 100))}
              />
            </Field>
          ))}
          <div className="full">
            <button
              type="button"
              className="button"
              onClick={async () => {
                try {
                  const r = await send("/parts-pricing/preview", {
                    cost: cost + freight,
                  });
                  setPrice(r.price);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Aplicar regra de lucro
            </button>
            <p>
              Custo completo: {money(cost + freight)} · Ganho bruto por unidade:{" "}
              {money(price - cost - freight)}
            </p>
          </div>
          <Field label="Motivo" full>
            <input
              required
              minLength={5}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {error && (
            <div className="error-box full" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="button" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={busy || !product}
          >
            {busy ? "Salvando..." : "Confirmar entrada"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

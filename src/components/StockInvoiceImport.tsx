import { useState } from "react";
import { useApp } from "../lib/context";
import { send } from "../lib/api";
import { money, type Entity } from "../lib/types";
import { salePrice } from "../../shared/pricing";
import { productLabel } from "../../shared/productIdentity";
import { CatalogPicker } from "./CatalogPicker";
import { NumericInput } from "./NumericInput";
import { Modal, Field } from "./ui";
type Line = {
  line: string;
  name: string;
  code: string;
  gtin: string;
  unit: string;
  quantity: number;
  totalCost: number;
  freight: number;
  catalog_id: string;
  candidates: string[];
  quantity_in_stock: number;
  cost: number;
  price: number;
  match: string;
};
type Preview = {
  key: string;
  number: string;
  supplier: string;
  issuedOn: string;
  items: Line[];
  already_imported: boolean;
};
type Choice = {
  line: string;
  mode: string;
  catalog_id: string;
  quantity: number;
  name: string;
  category: string;
  cost: number;
  price: number;
};
export function StockInvoiceImport({ onClose }: { onClose: () => void }) {
  const { data, refresh, notify } = useApp();
  const [xml, setXml] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [choices, setChoices] = useState<Choice[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const products = data.catalog.filter(
    (p) => p.kind === "product" && p.active && !p.archived_at && !p.merged_into,
  );
  const priceFor = (cost: number) =>
    data.parts_pricing ? salePrice(cost, data.parts_pricing) : cost;
  const patch = (index: number, fields: Partial<Choice>) =>
    setChoices((old) =>
      old.map((c, i) => (i === index ? { ...c, ...fields } : c)),
    );
  const chooseFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setPreview(null);
    setChoices([]);
    setXml("");
    setBusy(true);
    try {
      if (
        file.size > 2 * 1024 * 1024 ||
        !file.name.toLowerCase().endsWith(".xml")
      )
        throw new Error("Selecione um arquivo XML de até 2 MB.");
      const bytes = await file.arrayBuffer();
      // NF-e suppliers may export UTF-8 or ISO-8859-1 documents.
      const header = new TextDecoder("utf-8").decode(bytes.slice(0, 200));
      const encoding =
        /encoding\s*=\s*["'](?:iso-8859-1|windows-1252)["']/i.test(header)
          ? "windows-1252"
          : "utf-8";
      const content = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      const result: Preview = await send("/stock-invoices/preview", {
        xml: content,
      });
      setXml(content);
      setPreview(result);
      setChoices(
        result.items.map((item) => ({
          line: item.line,
          mode: item.catalog_id ? "existing" : "review",
          catalog_id: item.catalog_id,
          quantity: item.quantity_in_stock,
          name: item.name,
          category: "",
          cost: item.cost,
          price: item.price,
        })),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const valid =
    choices.length > 0 &&
    choices.every(
      (c) =>
        c.mode !== "review" &&
        Number.isInteger(c.quantity) &&
        c.quantity > 0 &&
        c.quantity <= 1000000 &&
        (c.mode === "existing"
          ? !!c.catalog_id
          : !!c.name.trim() &&
            Number.isInteger(c.cost) &&
            c.cost >= 0 &&
            Number.isInteger(c.price) &&
            c.price >= 0),
    );
  const confirm = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await send("/stock-invoices/import", {
        xml,
        choices: choices.map((c) => ({
          ...c,
          catalog_id: c.mode === "existing" ? c.catalog_id : "",
        })),
      });
      await refresh();
      notify(
        result.duplicate
          ? "Esta nota já foi importada. Nenhuma quantidade foi adicionada novamente."
          : `Nota importada: ${result.created} novos produtos, ${result.updated} produtos atualizados e ${result.quantity} unidades recebidas.`,
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Importar nota fiscal"
      description="Envie o XML da NF-e e confira os produtos antes de registrar a entrada."
      wide
      onClose={() => !busy && onClose()}
    >
      <div className="modal-body">
        <Field label="Arquivo XML da NF-e (até 2 MB)" full>
          <input
            type="file"
            accept=".xml,text/xml,application/xml"
            disabled={busy}
            onChange={(e) => void chooseFile(e.target.files?.[0])}
          />
        </Field>
        {busy && <p role="status">Processando nota fiscal…</p>}
        {preview && (
          <>
            <p>
              <strong>
                NF-e {preview.number} · {preview.supplier}
              </strong>
              <br />
              Emissão: {preview.issuedOn.split("-").reverse().join("/")}
              <br />
              <small>Chave: {preview.key}</small>
            </p>
            {preview.already_imported ? (
              <div className="error-box" role="alert">
                Esta nota já foi importada. As quantidades não serão adicionadas
                novamente.
              </div>
            ) : (
              <>
                <p>
                  Para produtos existentes, o estoque, o custo da nota e o preço
                  de venda pela regra de lucro serão atualizados. Confira a
                  quantidade em unidades, principalmente em caixas e embalagens.
                  O código do fornecedor será vinculado ao produto escolhido
                  para as próximas notas.
                </p>
                {preview.items.map((item, index) => {
                  const c = choices[index];
                  if (!c) return null;
                  const candidateNames = item.candidates
                    .map((id) => {
                      const product = products.find((p) => p.id === id);
                      return product ? productLabel(product) : "";
                    })
                    .filter(Boolean);
                  return (
                    <section
                      className="panel"
                      key={item.line}
                      style={{ padding: 18, marginBottom: 16 }}
                    >
                      <strong>{item.name}</strong>
                      <p>
                        <small>
                          Código do fornecedor: {item.code} · Nota:{" "}
                          {item.quantity} {item.unit}
                          {item.gtin ? " · Código de barras: " + item.gtin : ""}
                        </small>
                      </p>
                      <p>
                        <small>
                          Frete deste item: {money(item.freight)}
                          {c.quantity > 0
                            ? " · " +
                              money(Math.round(item.freight / c.quantity)) +
                              " por unidade"
                            : ""}
                          . Incluído no custo.
                        </small>
                      </p>
                      {c.mode === "review" && (
                        <p className="error-box">
                          {candidateNames.length
                            ? "Há produtos semelhantes: " +
                              candidateNames.join(", ") +
                              ". "
                            : "Produto ainda sem vínculo confirmado com este fornecedor. "}
                          Se a peça já veio do Sky Peças ou de outro fornecedor,
                          escolha o cadastro existente. Cadastre um novo produto
                          somente se for uma peça diferente.
                        </p>
                      )}
                      {item.match === "supplier" && (
                        <p>
                          <small>
                            Reconhecido pelo vínculo do fornecedor. Confira o
                            produto selecionado.
                          </small>
                        </p>
                      )}
                      {item.match === "barcode" && (
                        <p>
                          <small>
                            Reconhecido pelo código de barras de uma entrada
                            anterior.
                          </small>
                        </p>
                      )}
                      <div className="form-grid">
                        <Field label="Destino do item">
                          <select
                            disabled={busy}
                            value={c.mode}
                            onChange={(e) => {
                              const cost =
                                c.quantity > 0
                                  ? Math.round(item.totalCost / c.quantity)
                                  : 0;
                              patch(index, {
                                mode: e.target.value,
                                catalog_id:
                                  e.target.value === "existing"
                                    ? c.catalog_id
                                    : "",
                                ...(e.target.value === "new"
                                  ? { cost, price: priceFor(cost) }
                                  : {}),
                              });
                            }}
                          >
                            <option value="review">Escolha uma opção</option>
                            <option value="existing">
                              Produto já cadastrado
                            </option>
                            <option value="new">Cadastrar novo produto</option>
                          </select>
                        </Field>
                        <Field label="Quantidade a adicionar ao estoque (unidades)">
                          <NumericInput
                            disabled={busy}
                            type="number"
                            min={1}
                            max={1000000}
                            step="1"
                            value={c.quantity}
                            onChange={(e) => {
                              const quantity = Number(e.target.value),
                                cost =
                                  quantity > 0
                                    ? Math.round(item.totalCost / quantity)
                                    : 0;
                              patch(index, {
                                quantity,
                                ...(c.mode !== "existing"
                                  ? { cost, price: priceFor(cost) }
                                  : {}),
                              });
                            }}
                          />
                        </Field>
                        {c.mode === "existing" && (
                          <div className="field full">
                            <span>Produto que receberá a entrada</span>
                            <CatalogPicker
                              inlineResults
                              items={products}
                              value={c.catalog_id}
                              onChange={(catalog_id) =>
                                patch(index, { catalog_id })
                              }
                              kind="product"
                            />
                            {c.catalog_id && (
                              <small>
                                {(() => {
                                  const selected = products.find(
                                    (p) => p.id === c.catalog_id,
                                  );
                                  const totals = choices.reduce(
                                    (sum, choice, i) => {
                                      if (
                                        choice.mode === "existing" &&
                                        choice.catalog_id === c.catalog_id &&
                                        choice.quantity > 0
                                      ) {
                                        sum.cost += preview.items[i].totalCost;
                                        sum.quantity += choice.quantity;
                                      }
                                      return sum;
                                    },
                                    { cost: 0, quantity: 0 },
                                  );
                                  const cost = totals.quantity
                                    ? Math.round(totals.cost / totals.quantity)
                                    : 0;
                                  return (
                                    <>
                                      Custo: {money(selected?.cost || 0)} →{" "}
                                      {money(cost)} · Venda:{" "}
                                      {money(selected?.price || 0)} →{" "}
                                      {money(priceFor(cost))}. O cadastro será
                                      atualizado após confirmar a nota.
                                    </>
                                  );
                                })()}
                              </small>
                            )}
                          </div>
                        )}
                        {c.mode === "new" && (
                          <>
                            <Field label="Descrição" full>
                              <input
                                disabled={busy}
                                value={c.name}
                                maxLength={300}
                                onChange={(e) =>
                                  patch(index, { name: e.target.value })
                                }
                              />
                            </Field>
                            <Field label="Categoria">
                              <select
                                disabled={busy}
                                value={c.category}
                                onChange={(e) =>
                                  patch(index, { category: e.target.value })
                                }
                              >
                                <option value="">Sem categoria</option>
                                {(data.product_categories || [])
                                  .filter((x: Entity) => x.active)
                                  .map((x: Entity) => (
                                    <option key={x.id} value={x.name}>
                                      {x.name}
                                    </option>
                                  ))}
                              </select>
                            </Field>
                            <Field label="Custo total por unidade (R$)">
                              <NumericInput
                                disabled={busy}
                                type="number"
                                min="0"
                                max="1000000"
                                step=".01"
                                value={c.cost / 100}
                                onChange={(e) => {
                                  const cost = Math.round(
                                    Number(e.target.value) * 100,
                                  );
                                  patch(index, { cost, price: priceFor(cost) });
                                }}
                              />
                            </Field>
                            <Field label="Preço de venda por unidade (R$)">
                              <NumericInput
                                disabled={busy}
                                type="number"
                                min="0"
                                max="1000000"
                                step=".01"
                                value={c.price / 100}
                                onChange={(e) =>
                                  patch(index, {
                                    price: Math.round(
                                      Number(e.target.value) * 100,
                                    ),
                                  })
                                }
                              />
                            </Field>
                            <p className="field full">
                              <small>
                                Custo sugerido pela nota:{" "}
                                {money(item.totalCost)}, incluindo desconto,
                                frete e tributos adicionais informados. Confira
                                os valores; o preço de venda usa a regra de
                                lucro configurada.
                              </small>
                            </p>
                          </>
                        )}
                      </div>
                    </section>
                  );
                })}
              </>
            )}
          </>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy || !valid || !!preview?.already_imported}
          onClick={() => void confirm()}
        >
          Confirmar entrada da nota
        </button>
      </div>
    </Modal>
  );
}

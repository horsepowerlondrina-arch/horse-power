import { useEffect, useState } from "react";
import { api, send } from "../lib/api";
import { extensionMessage } from "../lib/extension";
import { Modal } from "./ui";
import { money, type Entity } from "../lib/types";
export function CapturePanel({
  orderId,
  source,
  onClose,
  catalog = false,
}: {
  orderId?: string;
  catalog?: boolean;
  source: "sky" | "tempario";
  onClose: (items: Entity[]) => Promise<void>;
}) {
  const [catalogId] = useState(() => crypto.randomUUID());
  const targetId = catalog ? catalogId : orderId!;
  const stateUrl = catalog
    ? `/catalog-capture/${targetId}`
    : `/orders/${targetId}/capture-state`;
  const [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [items, setItems] = useState<Entity[]>([]),
    [number, setNumber] = useState<number>();
  const [expires, setExpires] = useState(0);
  const [freight, setFreight] = useState(0);
  const [plate, setPlate] = useState("");
  const [plateAutofill, setPlateAutofill] = useState(false);
  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const r = await api(stateUrl);
        if (current) setItems(r.items);
      } catch (e) {
        if (current) setError((e as Error).message);
      }
    }
    void load();
    const timer = setInterval(load, 2500);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [stateUrl]);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const extension = await extensionMessage("HP_STATUS");
      if (catalog && !extension.catalogCapture)
        throw new Error(
          "Atualize o Conector Horse Power para a versão 1.3 e recarregue a página.",
        );
      const target = await send(
        catalog
          ? `/catalog-capture/${targetId}/start`
          : `/orders/${targetId}/capture-session`,
        { freight_unit: source === "sky" ? freight : 0 },
      );
      await extensionMessage("HP_CONNECT", {
        target: { ...target, orderId: targetId },
      });
      setNumber(target.number);
      setPlate(target.plate);
      setPlateAutofill(extension.plateAutofill === true);
      setExpires(Date.now() + target.expires_minutes * 60000);
      setConnected(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const state = await send(
        catalog
          ? `/catalog-capture/${targetId}/end`
          : `/orders/${targetId}/end-capture`,
        {},
      );
      try {
        await extensionMessage("HP_DISCONNECT", { orderId: targetId });
      } catch {
        /* Server already revoked the scoped connection. */
      }
      await onClose(state.items);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        source === "sky"
          ? "Adicionar produto do Sky Peças"
          : "Adicionar serviço do Tempario"
      }
      description={
        catalog
          ? "Envie itens ao catálogo sem precisar abrir um orçamento. Depois, confirme as entradas físicas no estoque."
          : "Os itens são salvos neste atendimento e no catálogo da oficina."
      }
      onClose={() => void close()}
    >
      <div className="modal-body capture-panel">
        <p>
          {connected
            ? `Conectado ${catalog ? "ao catálogo" : `ao atendimento #${number}`}. Vá ao fornecedor e clique em HP • Enviar no item desejado.`
            : "Conecte a extensão para definir esta tela como destino dos envios."}
        </p>
        {connected && (
          <p className="muted">
            Conexão válida até{" "}
            {new Date(expires).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            . Ao terminar, clique em Concluir captura.
          </p>
        )}
        {source === "sky" && (
          <label className="field">
            Frete por unidade (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={connected}
              value={freight / 100}
              onChange={(e) =>
                setFreight(Math.round(Number(e.target.value) * 100))
              }
            />
            <small>
              Aplicado a cada peça desta captura. Para outro frete, conclua e
              abra uma nova captura.
            </small>
          </label>
        )}
        <div className="capture-actions">
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => void connect()}
          >
            {connected ? "Reconectar extensão" : "Conectar extensão"}
          </button>
          {connected && (
            <a
              className="button"
              href={
                source === "sky"
                  ? "https://cliente.skypecas.com.br/"
                  : "https://sistema.tempar.io/"
              }
              target="_blank"
              rel="noreferrer"
            >
              Abrir {source === "sky" ? "Sky Peças" : "Tempario"}
            </a>
          )}
        </div>
        {connected && !catalog && source === "tempario" && (
          <p className="muted">
            {!plateAutofill ? (
              <>
                Para enviar a placa automaticamente,{" "}
                <a href="/downloads/horse-power-conector.zip" download>
                  atualize a extensão
                </a>{" "}
                e recarregue as páginas.
              </>
            ) : plate ? (
              <>
                Placa <strong>{plate}</strong>: será preenchida automaticamente
                no Tempario, inclusive se a aba já estiver aberta. Depois,
                clique em consultar no Tempario.
              </>
            ) : (
              "Este orçamento ainda não tem uma placa válida. Conclua a captura, informe o veículo no orçamento e abra novamente para enviar a placa."
            )}
          </p>
        )}
        {!connected && (
          <details>
            <summary>Como instalar a extensão</summary>
            <ol>
              <li>
                <a href="/downloads/horse-power-conector.zip" download>
                  Baixe o Conector Horse Power
                </a>{" "}
                e extraia o ZIP.
              </li>
              <li>Abra chrome://extensions e ative o Modo do desenvolvedor.</li>
              <li>
                Clique em Carregar sem compactação e escolha a pasta extraída.
              </li>
              <li>
                Desative a extensão antiga e recarregue Horse Power, Sky Peças e
                Tempario.
              </li>
            </ol>
          </details>
        )}
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        <h3>
          {catalog ? "Itens recebidos" : "Itens do atendimento"} ·{" "}
          {items.length}
        </h3>
        <div className="capture-list">
          {items.map((i) => (
            <div key={i.id}>
              <span>
                <strong>{i.name}</strong>
                <small>
                  {i.capture_source === "sky"
                    ? "Sky Peças"
                    : i.capture_source === "tempario"
                      ? "Tempario"
                      : "Catálogo"}
                  {i.duration_seconds
                    ? ` · ${Math.round(i.duration_seconds / 60)} min`
                    : ""}
                </small>
              </span>
              <span>
                <b>{money(i.price * i.quantity)}</b>
                {i.kind === "product" && (
                  <small>
                    Custo: {money(i.cost)} · Lucro/un.:{" "}
                    {money(i.price - i.cost)}
                  </small>
                )}
              </span>
            </div>
          ))}
        </div>
        <p className="muted">
          O custo do Sky e o preço sugerido pela configuração de lucro ficam
          salvos no catálogo. Confira os valores antes de vender. A
          disponibilidade do fornecedor não representa o estoque da oficina.
        </p>
      </div>
      <div className="modal-footer">
        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={() => void close()}
        >
          {busy ? "Aguarde…" : "Concluir captura"}
        </button>
      </div>
    </Modal>
  );
}

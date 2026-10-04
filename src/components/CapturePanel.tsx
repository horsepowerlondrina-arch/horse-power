import { useEffect, useState } from "react";
import { api, send } from "../lib/api";
import { extensionMessage } from "../lib/extension";
import { Modal } from "./ui";
import { money, type Entity } from "../lib/types";
export function CapturePanel({
  orderId,
  source,
  onClose,
}: {
  orderId: string;
  source: "sky" | "tempario";
  onClose: (items: Entity[]) => Promise<void>;
}) {
  const [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [items, setItems] = useState<Entity[]>([]),
    [number, setNumber] = useState<number>();
  const [expires, setExpires] = useState(0);
  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const r = await api(`/orders/${orderId}/capture-state`);
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
  }, [orderId]);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      await extensionMessage("HP_STATUS");
      const target = await send(`/orders/${orderId}/capture-session`, {});
      await extensionMessage("HP_CONNECT", { target: { ...target, orderId } });
      setNumber(target.number);
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
      const state = await send(`/orders/${orderId}/end-capture`, {});
      try {
        await extensionMessage("HP_DISCONNECT", { orderId });
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
      description="Os itens enviados pela extensão são salvos neste orçamento e no catálogo da oficina."
      onClose={() => void close()}
    >
      <div className="modal-body capture-panel">
        <p>
          {connected
            ? `Conectado ao orçamento #${number}. Vá ao fornecedor e clique em HP • Enviar no item desejado.`
            : "Conecte a extensão para definir este orçamento como destino dos envios."}
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
        <h3>Itens do orçamento · {items.length}</h3>
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
              <b>{money(i.price * i.quantity)}</b>
            </div>
          ))}
        </div>
        <p className="muted">
          Peças entram com preço sugerido pelas regras da extensão original.
          Depois de concluir a captura, revise os preços no orçamento. O saldo
          do fornecedor não entra no estoque da oficina.
        </p>
        <p className="muted">
          Serviços e tempos ficam disponíveis em{" "}
          <a href="/tempos" target="_blank" rel="noreferrer">
            Tempos de serviço
          </a>
          , com o veículo de referência.
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

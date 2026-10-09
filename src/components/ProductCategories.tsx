import { useState } from "react";
import { useApp } from "../lib/context";
import { send } from "../lib/api";
import { Modal, Field, Empty } from "./ui";
export function ProductCategories({ onClose }: { onClose: () => void }) {
  const { data, refresh, notify } = useApp();
  const [record, setRecord] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const categories = data.product_categories || [];
  const selected = categories.find((c) => c.id === confirm);
  const reset = () => { setRecord(null); setName(""); setRequestId(crypto.randomUUID()); };
  const act = async (path: string, body: unknown, method = "POST") => {
    if (busy) return false;
    setBusy(true); setError("");
    try { await send(path, body, method); await refresh(); return true; }
    catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  };
  return <Modal title="Categorias de produtos" description="Use os departamentos do Sky Peças como base e ajuste a lista da oficina." onClose={() => !busy && onClose()}>
    <div className="modal-body">
      <p>Renomear atualiza a categoria dos produtos vinculados. Remover retira a opção de novos cadastros e preserva as informações dos produtos existentes.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (await act("/product-categories" + (record ? "/" + record : ""), { name, request_id: requestId }, record ? "PUT" : "POST")) {
          reset(); notify("Categoria salva.");
        }
      }}>
        <Field label={record ? "Editar categoria" : "Adicionar categoria"}>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} disabled={busy} />
        </Field>
        <div className="capture-actions">
          <button type="submit" className="button primary" disabled={busy || !name.trim()}>{record ? "Salvar alteração" : "Adicionar"}</button>
          {record && <button type="button" className="button" onClick={reset} disabled={busy}>Cancelar edição</button>}
        </div>
      </form>
      <label><input type="checkbox" checked={removed} onChange={(e) => setRemoved(e.target.checked)} /> Mostrar categorias removidas</label>
      <div className="table-scroll"><table>
        <thead><tr><th>Categoria</th><th>Produtos</th><th>Ações</th></tr></thead>
        <tbody>{categories.filter((c) => c.active || removed).map((c) => <tr key={c.id}>
          <td>{c.name}{!c.active && <small>Removida</small>}</td><td>{c.product_count}</td>
          <td>{c.active ? <>
            <button type="button" className="button" disabled={busy} onClick={() => {setRecord(c.id);setName(c.name);setError("");}}>Editar</button>
            <button type="button" className="button" disabled={busy} onClick={() => setConfirm(c.id)}>Remover</button>
          </> : <button type="button" className="button" disabled={busy} onClick={async () => {
            if (await act("/product-categories", {name:c.name,request_id:crypto.randomUUID()})) notify("Categoria restaurada.");
          }}>Restaurar</button>}</td>
        </tr>)}</tbody>
      </table></div>
      {!categories.some((c) => c.active || removed) && <Empty title="Nenhuma categoria cadastrada" description="Adicione uma categoria para disponibilizá-la no cadastro de produtos." />}
      {selected && <div className="info-box" role="alert">
        <p>Remover a categoria {selected.name}? Os {selected.product_count} produtos vinculados serão preservados.</p>
        <div className="capture-actions">
          <button type="button" className="button" disabled={busy} onClick={() => setConfirm(null)}>Voltar</button>
          <button type="button" className="button primary" disabled={busy} onClick={async () => {
            if (await act("/product-categories/" + selected.id, {}, "DELETE")) {
              if (record===selected.id) reset();
              setConfirm(null);notify("Categoria removida da lista.");
            }
          }}>Confirmar remoção</button>
        </div>
      </div>}
    </div>
  </Modal>;
}

import { CatalogPicker } from "../components/CatalogPicker";
import { useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Printer,
  Check,
  CarFront,
  UserRound,
  Wrench,
  Package,
  ArrowRight,
  Save,
} from "lucide-react";
import { useApp } from "../lib/context";
import { send } from "../lib/api";
import { PlateField } from "../components/PlateField";
import { RegisterModal } from "./Registers";
import { money, today, statusLabel, type Entity } from "../lib/types";
import {
  PageHeading,
  Field,
  Badge,
  Modal,
  Submit,
  Empty,
} from "../components/ui";
export function OrderEditor() {
  const { id } = useParams();
  const { data } = useApp();
  const location = useLocation();
  const isNew = !id || id === "nova";
  const order = isNew ? undefined : data.orders.find((o) => o.id === id);
  if (!isNew && !order)
    return (
      <Empty
        title="Ordem não encontrada"
        description="Este atendimento não está disponível na oficina selecionada."
      />
    );
  return (
    <Editor
      key={order ? `${order.id}:${order.status}` : location.pathname}
      order={order}
      quote={location.pathname.startsWith("/orcamentos")}
    />
  );
}
function Editor({ order, quote }: { order?: Entity; quote: boolean }) {
  const { data, session, refresh, notify } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    guest_name: order?.guest_name || "",
    guest_plate: order?.guest_plate || "",
    guest_vehicle: order?.guest_vehicle || "",
    customer_id: order?.customer_id || "",
    vehicle_id: order?.vehicle_id || "",
    status: order?.status || (quote ? "quote" : "open"),
    entered_on: order?.entered_on || today(),
    due_on: order?.due_on || today(),
    km: order?.km || 0,
    problem: order?.problem || "",
    notes: order?.notes || "",
    discount: order?.discount || 0,
    items: (order?.items || []) as Entity[],
  });
  const [lookupPlate, setLookupPlate] = useState("");
  const [lookedUp, setLookedUp] = useState<Record<string, any>>({});
  const [tab, setTab] = useState("details");
  const [itemKind, setItemKind] = useState("product");
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [quickCreate, setQuickCreate] = useState<
    "customers" | "vehicles" | "catalog" | null
  >(null);
  const locked = order && ["completed", "cancelled"].includes(order.status);
  const set = (key: string, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));
  const products = form.items
    .filter((i) => i.kind === "product")
    .reduce((s, i) => s + i.price * i.quantity, 0);
  const services = form.items
    .filter((i) => i.kind === "service")
    .reduce((s, i) => s + i.price * i.quantity, 0);
  const total = products + services - form.discount;
  const customer = data.customers.find((c) => c.id === form.customer_id);
  const vehicle = data.vehicles.find((v) => v.id === form.vehicle_id);
  const add = () => {
    const item = data.catalog.find((c) => c.id === pick);
    if (!item) return;
    const existing = form.items.findIndex((i) => i.catalog_id === pick);
    if (existing >= 0)
      set(
        "items",
        form.items.map((i, index) =>
          index === existing ? { ...i, quantity: i.quantity + 1 } : i,
        ),
      );
    else
      set("items", [
        ...form.items,
        {
          id: crypto.randomUUID(),
          catalog_id: item.id,
          kind: item.kind,
          name: item.name,
          quantity: 1,
          price: item.price,
          cost: item.cost,
          professional_id: "",
        },
      ]);
    setPick("");
  };
  const changeItem = (index: number, key: string, value: any) =>
    set(
      "items",
      form.items.map((i, n) => (n === index ? { ...i, [key]: value } : i)),
    );
  const save = async () => {
    if (form.status !== "quote" && (!form.customer_id || !form.vehicle_id)) {
      setError("Selecione o cliente e o veículo.");
      setTab("details");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await send(
        `/orders${order ? `/${order.id}` : ""}`,
        { ...form, status: form.status === "quote" ? "quote" : "open" },
        order ? "PUT" : "POST",
      );
      await refresh();
      notify("Atendimento salvo com sucesso.");
      navigate(`/ordens/${result.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const transition = async () => {
    setBusy(true);
    setError("");
    try {
      if (confirm !== "cancelled")
        await send(
          `/orders/${order!.id}`,
          { ...form, status: form.status === "quote" ? "quote" : "open" },
          "PUT",
        );
      await send(`/orders/${order!.id}/status`, { status: confirm });
      await refresh();
      notify(
        confirm === "completed"
          ? "OS finalizada. Estoque e contas a receber atualizados."
          : "Situação atualizada.",
      );
      setConfirm("");
      navigate(
        `/ordens/${order!.id}${confirm === "completed" ? "/receber" : ""}`,
      );
    } catch (e) {
      setError((e as Error).message);
      setConfirm("");
    } finally {
      setBusy(false);
    }
  };
  const next: Record<string, [string, string]> = {
    quote: ["open", "Aprovar orçamento"],
    open: ["working", "Iniciar execução"],
    working: ["ready", "Marcar como pronta"],
    ready: ["completed", "Finalizar OS"],
  };
  return (
    <>
      <div className="no-print">
        <button
          className="back-link"
          onClick={() =>
            navigate(form.status === "quote" ? "/orcamentos" : "/ordens")
          }
        >
          <ArrowLeft size={16} />
          Voltar aos atendimentos
        </button>
        <PageHeading
          eyebrow="ATENDIMENTO"
          title={
            order
              ? `${order.status === "quote" ? "Orçamento" : "Ordem de serviço"} #${order.number}`
              : quote
                ? "Novo orçamento"
                : "Nova ordem de serviço"
          }
          description={
            order
              ? `${order.customer_name} · ${order.brand} ${order.model} · ${order.plate}`
              : "Um atendimento bem organizado começa aqui."
          }
          actions={
            <>
              {order && (
                <button className="button" onClick={() => window.print()}>
                  <Printer size={17} />
                  Imprimir / PDF
                </button>
              )}
              {!locked && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={save}
                >
                  <Save size={17} />
                  {busy ? "Salvando..." : "Salvar atendimento"}
                </button>
              )}
            </>
          }
        />
      </div>
      <section className="print-only print-order">
        <h1>HORSE POWER</h1>
        <h2>{session.tenant.name}</h2>
        <p>
          {session.tenant.address} · {session.tenant.phone}
        </p>
        <hr />
        <h2>
          {form.status === "quote" ? "Orçamento" : "Ordem de serviço"} #
          {order?.number || "Novo"}
        </h2>
        <p>
          Situação: {statusLabel[form.status]} · Entrada: {form.entered_on} ·
          Previsão: {form.due_on}
        </p>
        <p>
          Cliente: {customer?.name} · {customer?.phone} · {customer?.document}
        </p>
        <p>{customer?.address}</p>
        <p>
          Veículo: {vehicle?.brand} {vehicle?.model} · {vehicle?.plate} ·{" "}
          {form.km} km · Chassi: {vehicle?.chassis || "—"}
        </p>
        <p>Relato: {form.problem || "—"}</p>
        <table>
          <thead>
            <tr>
              <th>Produto / serviço</th>
              <th>Qtd.</th>
              <th>Unitário</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {form.items.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td>{i.quantity}</td>
                <td>{money(i.price)}</td>
                <td>{money(i.price * i.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Produtos: {money(products)} · Serviços: {money(services)} · Desconto:{" "}
          {money(form.discount)}
        </p>
        <h2>Total: {money(total)}</h2>
        <p>Observações: {form.notes || "—"}</p>
        <p>
          ___________________________________
          <br />
          Assinatura do cliente
        </p>
      </section>
      <div className="editor-layout no-print">
        <section className="panel editor-main">
          <div className="tabs">
            <button
              className={tab === "details" ? "active" : ""}
              onClick={() => setTab("details")}
            >
              <UserRound size={16} />
              Cliente e veículo
            </button>
            <button
              className={tab === "items" ? "active" : ""}
              onClick={() => setTab("items")}
            >
              <Wrench size={16} />
              Produtos e serviços<span>{form.items.length}</span>
            </button>
            <button
              className={tab === "notes" ? "active" : ""}
              onClick={() => setTab("notes")}
            >
              Observações
            </button>
          </div>
          <div className="editor-body">
            <fieldset disabled={!!locked || busy}>
              {tab === "details" ? (
                <>
                  <PlateField
                    value={lookupPlate}
                    disabled={!!locked}
                    onChange={setLookupPlate}
                    onFound={(r) => {
                      if (!r.vehicle) return;
                      if (r.source === "local") {
                        if (!r.vehicle.active) {
                          setError(
                            "O veículo encontrado está inativo. Reative-o no cadastro.",
                          );
                          return;
                        }
                        setForm((f) => ({
                          ...f,
                          customer_id: r.vehicle!.customer_id,
                          vehicle_id: r.vehicle!.id,
                          km: r.vehicle!.km,
                        }));
                      } else {
                        setLookedUp(r.vehicle);
                        setForm((f) => ({
                          ...f,
                          guest_plate: r.vehicle!.plate,
                          guest_vehicle: [
                            r.vehicle!.brand,
                            r.vehicle!.model,
                          ].join(" "),
                        }));
                        if (form.customer_id) setQuickCreate("vehicles");
                      }
                    }}
                  />
                  {form.status === "quote" && (
                    <div className="info-box">
                      Você pode salvar este orçamento sem cadastro. Vincule
                      cliente e veículo antes de aprovar.
                    </div>
                  )}
                  {form.status === "quote" && !form.customer_id && (
                    <div className="form-grid">
                      <Field label="Nome para o orçamento (opcional)">
                        <input
                          value={form.guest_name}
                          onChange={(e) => set("guest_name", e.target.value)}
                        />
                      </Field>
                      <Field label="Placa (opcional)">
                        <input
                          maxLength={7}
                          value={form.guest_plate}
                          onChange={(e) =>
                            set("guest_plate", e.target.value.toUpperCase())
                          }
                        />
                      </Field>
                      <Field label="Veículo (opcional)" full>
                        <input
                          value={form.guest_vehicle}
                          onChange={(e) => set("guest_vehicle", e.target.value)}
                        />
                      </Field>
                    </div>
                  )}
                  <h3 className="form-section-title">
                    <UserRound size={18} />
                    Dados do cliente
                  </h3>
                  <div className="form-grid">
                    <Field
                      label={
                        form.status === "quote"
                          ? "Cliente cadastrado (opcional)"
                          : "Cliente *"
                      }
                      full
                    >
                      <select
                        value={form.customer_id}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            customer_id: e.target.value,
                            vehicle_id: "",
                            km: 0,
                          }))
                        }
                      >
                        <option value="">Selecione o cliente</option>
                        {data.customers
                          .filter((c) => c.active || c.id === form.customer_id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    {!locked && (
                      <button
                        type="button"
                        className="text-button full"
                        onClick={() => setQuickCreate("customers")}
                      >
                        <Plus size={14} />
                        Cadastrar cliente sem sair
                      </button>
                    )}
                    {customer && (
                      <div className="customer-summary full">
                        <span>
                          {customer.phone || "Telefone não informado"}
                        </span>
                        <span>{customer.email || "E-mail não informado"}</span>
                      </div>
                    )}
                  </div>
                  <h3 className="form-section-title">
                    <CarFront size={18} />
                    Veículo e entrada
                  </h3>
                  <div className="form-grid">
                    <Field
                      label={
                        form.status === "quote"
                          ? "Veículo cadastrado (opcional)"
                          : "Veículo do cliente *"
                      }
                      full
                    >
                      <select
                        disabled={!form.customer_id || !!locked}
                        value={form.vehicle_id}
                        onChange={(e) => {
                          const v = data.vehicles.find(
                            (v) => v.id === e.target.value,
                          );
                          setForm((f) => ({
                            ...f,
                            vehicle_id: e.target.value,
                            km: v?.km || 0,
                          }));
                        }}
                      >
                        <option value="">Selecione o veículo</option>
                        {data.vehicles
                          .filter(
                            (v) =>
                              v.customer_id === form.customer_id &&
                              (v.active || v.id === form.vehicle_id),
                          )
                          .map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.plate} · {v.brand} {v.model}
                            </option>
                          ))}
                      </select>
                    </Field>
                    {!locked && form.customer_id && (
                      <button
                        type="button"
                        className="text-button full"
                        onClick={() => setQuickCreate("vehicles")}
                      >
                        <Plus size={14} />
                        Cadastrar veículo deste cliente
                      </button>
                    )}
                    <Field label="Quilometragem">
                      <input
                        type="number"
                        min="0"
                        value={form.km}
                        onChange={(e) => set("km", Number(e.target.value))}
                      />
                    </Field>
                    <Field label="Data de entrada">
                      <input
                        type="date"
                        value={form.entered_on}
                        onChange={(e) => set("entered_on", e.target.value)}
                      />
                    </Field>
                    <Field label="Previsão de entrega">
                      <input
                        type="date"
                        value={form.due_on}
                        min={form.entered_on}
                        onChange={(e) => set("due_on", e.target.value)}
                      />
                    </Field>
                    <Field label="Relato do cliente / problema" full>
                      <textarea
                        rows={4}
                        maxLength={500}
                        placeholder="Descreva o que precisa ser verificado no veículo..."
                        value={form.problem}
                        onChange={(e) => set("problem", e.target.value)}
                      />
                    </Field>
                  </div>
                  {!locked && (
                    <button
                      type="button"
                      className="button next-step"
                      onClick={() => setTab("items")}
                    >
                      Adicionar produtos e serviços
                      <ArrowRight size={16} />
                    </button>
                  )}
                </>
              ) : tab === "items" ? (
                <>
                  <div className="tabs">
                    {[
                      ["product", "Produtos"],
                      ["service", "Serviços"],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={itemKind === value ? "active" : ""}
                        onClick={() => {
                          setItemKind(value);
                          setPick("");
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <h3>
                    {itemKind === "product"
                      ? "Peças e produtos"
                      : "Serviços do atendimento"}
                  </h3>
                  <p className="muted">
                    Adicione itens do catálogo e atribua os serviços à sua
                    equipe.
                  </p>
                  {!locked && (
                    <div className="item-picker">
                      <CatalogPicker
                        key={itemKind}
                        kind={itemKind}
                        items={data.catalog.filter(
                          (c) => c.active && c.kind === itemKind,
                        )}
                        value={pick}
                        onChange={setPick}
                      />
                      <button
                        className="button primary"
                        type="button"
                        disabled={!pick}
                        onClick={add}
                      >
                        <Plus size={17} />
                        Adicionar
                      </button>
                    </div>
                  )}
                  {!locked && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setQuickCreate("catalog")}
                    >
                      + Cadastrar{" "}
                      {itemKind === "product" ? "produto" : "serviço"} sem sair
                    </button>
                  )}
                  {form.items.some((i) => i.kind === itemKind) ? (
                    <div className="order-items">
                      {form.items.map(
                        (item, index) =>
                          item.kind === itemKind && (
                            <div className="order-item" key={item.id}>
                              <div className="order-item-head">
                                <span className="square-icon">
                                  {item.kind === "service" ? (
                                    <Wrench size={18} />
                                  ) : (
                                    <Package size={18} />
                                  )}
                                </span>
                                <div>
                                  <strong>{item.name}</strong>
                                  <small>
                                    {item.kind === "service"
                                      ? "Serviço"
                                      : "Produto"}
                                  </small>
                                </div>
                                {!locked && (
                                  <button
                                    type="button"
                                    className="icon-button danger"
                                    aria-label={`Remover ${item.name}`}
                                    onClick={() =>
                                      set(
                                        "items",
                                        form.items.filter(
                                          (_, i) => i !== index,
                                        ),
                                      )
                                    }
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                              <div className="item-fields">
                                <Field label="Quantidade">
                                  <input
                                    type="number"
                                    min="1"
                                    max="10000"
                                    step="1"
                                    value={item.quantity}
                                    onChange={(e) =>
                                      changeItem(
                                        index,
                                        "quantity",
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                </Field>
                                <Field label="Valor unitário (R$)">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.price / 100}
                                    onChange={(e) =>
                                      changeItem(
                                        index,
                                        "price",
                                        Math.round(
                                          Number(e.target.value) * 100,
                                        ),
                                      )
                                    }
                                  />
                                </Field>
                                {item.kind === "service" && (
                                  <Field label="Profissional">
                                    <select
                                      value={item.professional_id || ""}
                                      onChange={(e) =>
                                        changeItem(
                                          index,
                                          "professional_id",
                                          e.target.value,
                                        )
                                      }
                                    >
                                      <option value="">Não atribuído</option>
                                      {data.professionals
                                        .filter(
                                          (p) =>
                                            p.active ||
                                            p.id === item.professional_id,
                                        )
                                        .map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.name}
                                          </option>
                                        ))}
                                    </select>
                                  </Field>
                                )}
                                <div className="item-total">
                                  <span>Total</span>
                                  <strong>
                                    {money(item.price * item.quantity)}
                                  </strong>
                                </div>
                              </div>
                            </div>
                          ),
                      )}
                    </div>
                  ) : (
                    <Empty
                      title="Monte seu atendimento"
                      description="Selecione acima os produtos e serviços necessários."
                    />
                  )}
                </>
              ) : (
                <>
                  <h3>Observações do atendimento</h3>
                  <Field label="Informações adicionais">
                    <textarea
                      rows={8}
                      maxLength={4000}
                      value={form.notes}
                      onChange={(e) => set("notes", e.target.value)}
                      placeholder="Informações para a equipe e para a impressão da OS..."
                    />
                  </Field>
                  <div className="info-box">
                    As observações serão incluídas na impressão do atendimento.
                  </div>
                </>
              )}
            </fieldset>
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
          </div>
        </section>
        <aside className="panel order-summary">
          <div className="summary-heading">
            <h2>Resumo do atendimento</h2>
            <Badge status={form.status} />
          </div>
          <div className="summary-values">
            <div>
              <span>Produtos</span>
              <strong>{money(products)}</strong>
            </div>
            <div>
              <span>Serviços</span>
              <strong>{money(services)}</strong>
            </div>
            <div>
              <span>Subtotal</span>
              <strong>{money(products + services)}</strong>
            </div>
            <Field label="Desconto (R$)">
              <input
                disabled={!!locked}
                type="number"
                min="0"
                max={(products + services) / 100}
                step="0.01"
                value={form.discount / 100}
                onChange={(e) =>
                  set("discount", Math.round(Number(e.target.value) * 100))
                }
              />
            </Field>
          </div>
          <div className="summary-total">
            <span>Total do atendimento</span>
            <strong>{money(total)}</strong>
          </div>
          <p className="summary-note">
            {form.status === "quote"
              ? "O orçamento não movimenta estoque nem gera cobrança."
              : "Ao finalizar, as peças são baixadas do estoque e o valor é lançado em contas a receber."}
          </p>
          {order && next[order.status] && (
            <button
              className="button primary full-width"
              disabled={busy}
              onClick={() => setConfirm(next[order.status][0])}
            >
              <Check size={17} />
              {next[order.status][1]}
            </button>
          )}
          {order && order.status === "completed" && (
            <button
              className="button full-width"
              onClick={() => navigate("/financeiro")}
            >
              Ver contas a receber
              <ArrowUpRightIcon />
            </button>
          )}
          {order && !locked && (
            <button
              className="text-button danger cancel-order"
              onClick={() => setConfirm("cancelled")}
            >
              Cancelar atendimento
            </button>
          )}
          {!order && (
            <div className="info-box">
              Salve o atendimento para avançar sua situação.
            </div>
          )}
        </aside>
      </div>
      {quickCreate && (
        <RegisterModal
          kind={quickCreate}
          record={null}
          initial={
            quickCreate === "vehicles"
              ? { ...lookedUp, customer_id: form.customer_id }
              : quickCreate === "catalog"
                ? { kind: itemKind }
                : undefined
          }
          onClose={() => setQuickCreate(null)}
          onSaved={(recordId, values) => {
            if (quickCreate === "customers")
              setForm((f) => ({
                ...f,
                customer_id: recordId,
                vehicle_id: values.vehicle_id || "",
                km: values.vehicle_km || 0,
              }));
            else if (quickCreate === "catalog") {
              setForm((f) => ({
                ...f,
                items: [
                  ...f.items,
                  {
                    id: crypto.randomUUID(),
                    catalog_id: recordId,
                    kind: values.kind,
                    name: values.name,
                    price: values.price,
                    cost: values.cost,
                    quantity: 1,
                    professional_id: "",
                  },
                ],
              }));
            } else
              setForm((f) => ({
                ...f,
                vehicle_id: recordId,
                km: Number(values.km) || 0,
              }));
          }}
        />
      )}
      {confirm && (
        <Modal
          title={
            confirm === "cancelled"
              ? "Cancelar este atendimento?"
              : next[order!.status]?.[1] || "Alterar situação"
          }
          description={
            confirm === "completed"
              ? "Esta ação baixa os produtos do estoque, gera o recebível e bloqueia a edição da OS."
              : confirm === "cancelled"
                ? "O atendimento será preservado no histórico como cancelado. Esta ação não pode ser desfeita nesta fase."
                : "Os dados atuais serão salvos e o atendimento seguirá para a próxima etapa."
          }
          onClose={() => !busy && setConfirm("")}
        >
          <div className="modal-footer">
            <button
              className="button"
              onClick={() => setConfirm("")}
              disabled={busy}
            >
              Voltar
            </button>
            <button
              className="button primary"
              onClick={transition}
              disabled={busy}
            >
              {busy ? "Processando..." : "Confirmar"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={16} />;
}

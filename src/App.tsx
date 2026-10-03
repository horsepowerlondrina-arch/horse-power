import { Login } from "./pages/Login";
import { Expenses, FinanceNav } from "./pages/Expenses";
import { useEffect, useState } from "react";
import {
  NavLink,
  Route,
  Routes,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Users,
  CarFront,
  Package,
  Wrench,
  Wallet,
  Settings,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  X,
  ArrowUpRight,
  Command,
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
  ArrowRight,
  CalendarDays,
  TriangleAlert,
} from "lucide-react";
import { api, send } from "./lib/api";
import { AppContext } from "./lib/context";
import { today, initials, type Workspace, type Session } from "./lib/types";
import { Modal, SearchBox, Empty } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
import { Registers } from "./pages/Registers";
import { Orders } from "./pages/Orders";
import { OrderEditor } from "./pages/OrderEditor";
import { Stock, Finance, Settings as SettingsPage } from "./pages/Management";
import { OrderView } from "./pages/OrderView";
import { Payment } from "./pages/Payment";
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const [mobile, setMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState(false);
  const [switching, setSwitching] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const refresh = async () => {
    const result = await api<Workspace>("/workspace");
    setData(result);
  };
  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [nextSession, nextData] = await Promise.all([
        api<Session>("/session"),
        api<Workspace>("/workspace"),
      ]);
      setSession(nextSession);
      setData(nextData);
    } catch (e) {
      if ((e as Error).message.includes("Entre na sua conta")) setSession(null);
      else setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (toast) {
      const timeout = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timeout);
    }
  }, [toast]);
  useEffect(() => {
    setMobile(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  if (loading)
    return (
      <div className="loading-screen">
        <div className="brand-mark">
          H<span>P</span>
        </div>
        <LoaderCircle className="spin" />
        <p>Preparando sua oficina...</p>
      </div>
    );
  if (loadError)
    return (
      <div className="loading-screen">
        <TriangleAlert />
        <h2>Não foi possível carregar a oficina</h2>
        <p>{loadError}</p>
        <button className="button primary" onClick={load}>
          Tentar novamente
        </button>
      </div>
    );
  if (!session) return <Login onLogin={load} />;
  if (!data) return null;
  const groups: {
    title: string;
    items: [string, string, typeof LayoutDashboard][];
  }[] = [
    {
      title: "PRINCIPAL",
      items: [
        ["/dashboard", "Visão geral", LayoutDashboard],
        ["/ordens", "Ordens de serviço", ClipboardList],
        ["/orcamentos", "Orçamentos", FileText],
      ],
    },
    {
      title: "CADASTROS",
      items: [
        ["/clientes", "Clientes", Users],
        ["/veiculos", "Veículos", CarFront],
        ["/catalogo", "Produtos e serviços", Package],
        ["/profissionais", "Profissionais", Wrench],
      ],
    },
    {
      title: "GESTÃO",
      items: [
        ["/estoque", "Estoque", Package],
        ["/financeiro", "Financeiro", Wallet],
      ],
    },
  ];
  const admin = session.role === "owner";
  const visibleGroups = admin
    ? groups
    : [
        {
          title: "OPERAÇÃO",
          items: groups[0].items.filter(([path]) => path === "/ordens"),
        },
      ];
  const current =
    groups
      .flatMap((g) => g.items)
      .find(([path]) => location.pathname.startsWith(path))?.[1] ||
    (location.pathname === "/configuracoes" ? "Configurações" : "Atendimento");
  const active = data.orders.filter((o) =>
    ["open", "working", "ready", "awaiting_payment"].includes(
      o.display_status || o.status,
    ),
  ).length;
  const low = data.catalog.filter(
    (p) =>
      p.kind === "product" &&
      p.active &&
      p.stock_verified !== 0 &&
      p.stock <= p.minimum_stock,
  );
  const overdue = data.receivables.filter(
    (r) => r.status === "open" && r.due_on <= today(),
  );
  const deliveries = data.orders.filter(
    (o) =>
      ["open", "working", "ready"].includes(o.status) && o.due_on <= today(),
  );
  const birthday = data.customers.filter(
    (c) => c.active && c.birthday.slice(5) === today().slice(5),
  );
  const alertCount =
    low.length + overdue.length + deliveries.length + birthday.length;
  const switchTenant = async (tenant: string) => {
    setSwitching(true);
    try {
      await send("/tenant", { tenant_id: tenant });
      const [s, d] = await Promise.all([
        api<Session>("/session"),
        api<Workspace>("/workspace"),
      ]);
      setSession(s);
      setData(d);
      navigate("/dashboard");
      setToast("Oficina alterada.");
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setSwitching(false);
    }
  };
  const results = search.trim()
    ? [
        ...data.orders
          .filter((o) =>
            `${o.number} ${o.customer_name} ${o.plate}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((o) => ({
            id: o.id,
            label: `#${o.number} · ${o.customer_name}`,
            detail: `${o.brand} ${o.model} · ${o.plate}`,
            path: `/ordens/${o.id}`,
          })),
        ...data.customers
          .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
          .map((c) => ({
            id: c.id,
            label: c.name,
            detail: "Cliente",
            path: `/clientes?q=${encodeURIComponent(c.name)}`,
          })),
        ...data.catalog
          .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
          .map((c) => ({
            id: c.id,
            label: c.name,
            detail: c.kind === "product" ? "Produto" : "Serviço",
            path: `/catalogo?q=${encodeURIComponent(c.name)}`,
          })),
      ].slice(0, 10)
    : [];
  return (
    <AppContext.Provider value={{ data, session, refresh, notify: setToast }}>
      <div className="app-shell">
        {mobile && (
          <button
            aria-label="Fechar menu"
            className="sidebar-backdrop"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
          <NavLink className="brand" to="/dashboard">
            <img
              className="official-logo"
              src="/brand/horse-power.jpg"
              alt="Horse Power Car Service"
            />
          </NavLink>
          <div className="workspace-switcher">
            <img src="/brand/icon.jpg" className="workshop-avatar" alt="" />
            <div>
              <span>SUA OFICINA</span>
              <strong>{session.tenant.name}</strong>
            </div>
          </div>
          <nav>
            {visibleGroups.map((group) => (
              <div className="nav-group" key={group.title}>
                <h2>{group.title}</h2>
                {group.items.map(([path, label, Icon]) => (
                  <NavLink
                    key={path}
                    to={path}
                    className={({ isActive }) =>
                      `nav-item ${isActive ? "active" : ""}`
                    }
                  >
                    <Icon size={19} />
                    <span>{label}</span>
                    {path === "/ordens" && active > 0 && <b>{active}</b>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="foundation-note">
              <span className="tiny-dot red" /> Seu próximo nível começa aqui.
              <span>Uma oficina mais organizada.</span>
            </div>
            {admin && (
              <NavLink
                to="/configuracoes"
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <Settings size={19} />
                <span>Configurações</span>
              </NavLink>
            )}
            <div className="user-card">
              <span className="user-avatar">{initials(session.user.name)}</span>
              <div>
                <strong>{session.user.name}</strong>
                <span>{admin ? "Administrador" : "Mecânico"}</span>
              </div>
              <button
                className="icon-button"
                aria-label="Sair da conta"
                onClick={async () => {
                  try {
                    await send("/logout", {});
                    setSession(null);
                    setData(null);
                  } catch (e) {
                    setToast((e as Error).message);
                  }
                }}
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </aside>
        <div className="app-main">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button menu-toggle"
                aria-label="Abrir menu"
                onClick={() => setMobile(true)}
              >
                <Menu size={21} />
              </button>
              <span>Painel da oficina</span>
              <span className="breadcrumb-divider">/</span>
              <strong>{current}</strong>
            </div>
            <div className="topbar-actions">
              <button
                className="global-search"
                onClick={() => {
                  setSearch("");
                  setSearchOpen(true);
                }}
              >
                <Search size={17} />
                <span>Buscar na oficina...</span>
                <kbd>⌘ K</kbd>
              </button>
              <span className="topbar-divider" />
              <button
                className="notification-button icon-button"
                aria-label={`Notificações: ${alertCount} pendências`}
                onClick={() => setNotifications(true)}
              >
                <Bell size={20} />
                {alertCount > 0 && <i />}
              </button>
              <span className="topbar-avatar">
                {initials(session.user.name)}
              </span>
            </div>
          </header>
          <main className="page-content">
            {!admin && !/^\/ordens(?:\/[^/]+)?$/.test(location.pathname) ? (
              <Navigate to="/ordens" replace />
            ) : !admin && location.pathname === "/ordens/nova" ? (
              <Navigate to="/ordens" replace />
            ) : (
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/ordens" element={<Orders />} />
                <Route path="/orcamentos" element={<Orders quotes />} />
                <Route path="/ordens/nova" element={<OrderEditor />} />
                <Route
                  path="/ordens/:id"
                  element={<OrderView key={location.pathname} />}
                />
                <Route path="/ordens/:id/editar" element={<OrderEditor />} />
                <Route
                  path="/ordens/:id/receber"
                  element={<Payment key={location.pathname} />}
                />
                <Route path="/orcamentos/novo" element={<OrderEditor />} />
                <Route
                  path="/clientes"
                  element={<Registers key={location.key} kind="customers" />}
                />
                <Route
                  path="/veiculos"
                  element={<Registers kind="vehicles" />}
                />
                <Route
                  path="/catalogo"
                  element={<Registers key={location.key} kind="catalog" />}
                />
                <Route
                  path="/profissionais"
                  element={<Registers kind="professionals" />}
                />
                <Route path="/estoque" element={<Stock />} />
                <Route path="/financeiro" element={<Expenses />} />
                <Route
                  path="/financeiro/receber"
                  element={
                    <>
                      <FinanceNav />
                      <Finance />
                    </>
                  }
                />
                <Route path="/financeiro/caixa" element={<Expenses cash />} />
                <Route path="/configuracoes" element={<SettingsPage />} />
                <Route
                  path="/"
                  element={<Navigate to="/dashboard" replace />}
                />
                <Route
                  path="*"
                  element={
                    <Empty
                      title="Página não encontrada"
                      action={
                        <button
                          className="button"
                          onClick={() => navigate("/dashboard")}
                        >
                          Voltar ao painel
                        </button>
                      }
                    />
                  }
                />
              </Routes>
            )}
          </main>
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button aria-label="Fechar mensagem" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {switching && (
        <div className="switching-overlay">
          <LoaderCircle className="spin" />
          Alternando oficina...
        </div>
      )}
      {searchOpen && (
        <Modal
          title="Buscar na oficina"
          description="Encontre ordens de serviço, clientes, produtos e serviços."
          onClose={() => setSearchOpen(false)}
        >
          <div className="modal-body">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Digite um nome, número ou placa..."
            />
            <div className="search-results">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSearchOpen(false);
                    navigate(r.path);
                  }}
                >
                  <div>
                    <strong>{r.label}</strong>
                    <small>{r.detail}</small>
                  </div>
                  <ArrowUpRight size={18} />
                </button>
              ))}
              {search && !results.length && <Empty />}
              {!search && (
                <p className="muted">
                  Comece a digitar para pesquisar nos dados desta oficina.
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
      {notifications && (
        <Modal
          title="Central de notificações"
          description="O que merece sua atenção hoje."
          onClose={() => setNotifications(false)}
        >
          <div className="modal-body notifications-list">
            {[
              {
                count: deliveries.length,
                title: "Entregas previstas ou atrasadas",
                detail: "Acompanhe as ordens que precisam de atenção.",
                path: "/ordens",
                Icon: CalendarDays,
              },
              {
                count: overdue.length,
                title: "Contas vencidas ou para hoje",
                detail: "Confira os recebimentos pendentes.",
                path: "/financeiro",
                Icon: Wallet,
              },
              {
                count: low.length,
                title: "Produtos no estoque mínimo",
                detail: "Planeje a reposição das peças.",
                path: "/estoque?low=1",
                Icon: Package,
              },
              {
                count: birthday.length,
                title: "Aniversariantes de hoje",
                detail: "Clientes que fazem aniversário hoje.",
                path: "/clientes",
                Icon: Users,
              },
            ]
              .filter((item) => admin || item.path === "/ordens")
              .map(({ count, title, detail, path, Icon }) => (
                <button
                  key={title}
                  onClick={() => {
                    setNotifications(false);
                    navigate(path);
                  }}
                >
                  <span className="square-icon">
                    <Icon size={21} />
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </div>
                  <b>{count}</b>
                  <ArrowUpRight size={17} />
                </button>
              ))}
          </div>
        </Modal>
      )}
    </AppContext.Provider>
  );
}

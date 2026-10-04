import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  LayoutDashboard,
  ClipboardList,
  FileText,
  Users,
  CarFront,
  Package,
  Wrench,
  Wallet,
  Settings,
  ArrowDownLeft,
  ArrowUpRight as Receive,
} from "lucide-react";
import { useApp } from "../lib/context";

const sections = [
  {
    title: "Atendimento",
    items: [
      {
        to: "/ordens",
        title: "Ordens de serviço",
        description: "Acompanhe os serviços e o andamento de cada veículo.",
        Icon: ClipboardList,
      },
      {
        to: "/orcamentos",
        title: "Orçamentos",
        description: "Prepare propostas e acompanhe as aprovações.",
        Icon: FileText,
      },
      {
        to: "/dashboard",
        title: "Visão geral",
        description: "Veja os indicadores e os resultados da oficina.",
        Icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "Cadastros e estoque",
    items: [
      {
        to: "/tempos",
        title: "Tempos de serviço",
        description: "Consulte tempos capturados por serviço e veículo.",
        Icon: Wrench,
      },
      {
        to: "/clientes",
        title: "Clientes",
        description: "Encontre contatos e mantenha os cadastros em dia.",
        Icon: Users,
      },
      {
        to: "/veiculos",
        title: "Veículos",
        description: "Consulte placas e veículos dos seus clientes.",
        Icon: CarFront,
      },
      {
        to: "/catalogo",
        title: "Produtos e serviços",
        description: "Organize peças, serviços e preços do catálogo.",
        Icon: Wrench,
      },
      {
        to: "/estoque",
        title: "Estoque",
        description: "Controle saldos, entradas e saídas de peças.",
        Icon: Package,
      },
      {
        to: "/profissionais",
        title: "Profissionais",
        description: "Gerencie os profissionais da oficina.",
        Icon: Users,
      },
    ],
  },
  {
    title: "Financeiro e administração",
    items: [
      {
        to: "/financeiro",
        title: "Contas a pagar",
        description: "Organize despesas, vencimentos e pagamentos.",
        Icon: ArrowDownLeft,
      },
      {
        to: "/financeiro/receber",
        title: "Contas a receber",
        description: "Acompanhe recebimentos e parcelas pendentes.",
        Icon: Receive,
      },
      {
        to: "/financeiro/caixa",
        title: "Caixa",
        description: "Consulte as movimentações financeiras.",
        Icon: Wallet,
      },
      {
        to: "/configuracoes",
        title: "Configurações",
        description: "Ajuste os dados e as preferências da oficina.",
        Icon: Settings,
      },
    ],
  },
];
export function Home() {
  const { session } = useApp();
  const admin = session.role === "owner";
  return (
    <div className="module-home">
      <header className="module-home-heading">
        <span>HORSE POWER · CAR SERVICE</span>
        <h1>Por onde vamos começar?</h1>
        <p>Escolha uma área para cuidar da sua oficina.</p>
      </header>
      {sections.map((section) => {
        const items = section.items.filter(
          (item) => admin || item.to === "/ordens",
        );
        if (!items.length) return null;
        return (
          <section
            className="module-section"
            key={section.title}
            aria-label={section.title}
          >
            <h2>{section.title}</h2>
            <div className="module-grid">
              {items.map(({ to, title, description, Icon }) => (
                <Link to={to} className="module-card" key={to}>
                  <div className="module-card-top">
                    <span className="module-icon">
                      <Icon size={23} aria-hidden="true" />
                    </span>
                    <ArrowUpRight
                      className="module-arrow"
                      size={19}
                      aria-hidden="true"
                    />
                  </div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

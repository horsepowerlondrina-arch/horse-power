# Arquitetura e modelo de domínio

## Decisões da primeira fase

Aplicação web local em React + TypeScript, Vite, Node/Express e SQLite persistente. API REST própria; não depende de conta em provedor externo. SQLite serve à fundação e à validação local; PostgreSQL com migrações e isolamento adicional por políticas é a evolução recomendada para operação comercial. Nenhuma promessa de produção ou cobrança SaaS nesta fase.

- `src/pages`: fluxos de produto; `src/components`: controles/layout reutilizáveis; `src/lib`: cliente HTTP e tipos.
- `server/domain`: cálculos monetários/estados; `server/services`: casos de uso com transações; `server/db`: conexão, esquema, migração e dados fictícios; `server/auth`: senhas, sessões e contexto autorizado; `server/app.ts`: transporte HTTP/validação.
- Valores monetários em centavos inteiros. Totais calculados no servidor. Estoque em unidades inteiras nesta fase. Datas de calendário ISO e timestamps UTC; apresentação pt-BR/BRL.
- Autenticação por senha com scrypt e sessão opaca em cookie HttpOnly/SameSite; seleção da oficina validada contra associação no servidor. Nenhum `tenant_id` enviado em dados de cadastro autoriza acesso.
- Todas as consultas de negócio restringem a oficina da sessão; referências entre registros são validadas e chaves estrangeiras compostas evitam vínculo cruzado. Testes devem tentar acesso entre oficinas.
- OS guarda snapshots do preço/custo/descrição dos itens. Concluir gera movimentos de estoque e recebível na mesma transação. Repetição não pode duplicar os efeitos. Sem estoque suficiente, conclusão falha integralmente. Orçamento não consome estoque.
- Estados: orçamento → aberta → em execução → pronta → finalizada. Cancelamento permitido antes da conclusão; documentos concluídos não são editados nesta primeira fase. Estorno financeiro/estoque será um caso de uso explícito futuro.
- Recebível com plano de parcelas: juros do cliente e taxa da oficina separados. Cada parcela confirmada gera caixa líquido atomicamente; segunda baixa é recusada.

## Entidades implantadas

Oficina (`tenants`), usuário (`users`), vínculo/perfil (`memberships`), sessão (`sessions`), cliente (`customers`), veículo (`vehicles`), profissional (`professionals`), item de catálogo (`catalog`: produto/serviço), documento de atendimento (`orders`: orçamento ou OS), item (`order_items`), movimento de estoque (`stock_movements`), título financeiro (`receivables`), movimento de caixa (`cash_entries`) e evento de auditoria (`audit_events`).

Cada entidade de negócio possui `tenant_id`. Cliente → veículos é 1:N; cliente/veículo → ordens 1:N; ordem → itens 1:N; item → catálogo e profissional opcional; ordem concluída → recebível único; recebível → parcelas 1:N; parcela quitada → lançamento de caixa único. Número de OS e SKU/placa são únicos dentro da oficina, não globalmente.

## Entidades previstas

Fornecedores, compras/itens, vendas/itens, contas a pagar, contas financeiras, categorias/plano de contas, modelos de contas, comissões, checklists/respostas, agendamentos, configurações adicionais por oficina e documentos fiscais. Histórico operacional usará eventos e relações existentes. Expansão deve preservar transações, chaves da oficina, permissões e valores em centavos.

## Navegação

| Grupo         | Rota                                                             | Fase                                                      |
| ------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| Visão geral   | `/dashboard`                                                     | Inicial                                                   |
| Operação      | `/ordens`, `/orcamentos`                                         | Inicial                                                   |
| Cadastros     | `/clientes`, `/veiculos`, `/catalogo`, `/profissionais`          | Inicial                                                   |
| Gestão        | `/estoque`, `/financeiro`                                        | Inicial: consulta de estoque e recebíveis                 |
| Administração | `/configuracoes`                                                 | Inicial: oficina, sessão e escopo                         |
| Expansão      | `/agenda`, `/fornecedores`, `/compras`, `/vendas`, `/relatorios` | Planejadas; sem telas vazias disfarçadas de implementadas |

## Design system

Marca provisória Horse Power. Sidebar branca compacta, marca preta, superfícies brancas sobre cinza frio, texto quase preto, destaque vermelho `#e32935`. Estados têm texto e cor (âmbar/azul/verde/cinza), sem depender só de cor. Tipografia sans-serif, números tabulares, títulos com peso 650–750, espaçamento em múltiplos de 4px, bordas suaves, cantos de 10–16px. Botão primário vermelho, secundário branco, destrutivo com confirmação. Ícones Lucide consistentes. Foco visível, formulários rotulados, diálogo com foco contido, tabelas com rolagem própria e sidebar recolhida em celular. Dashboard exibe valores reais do banco, sem percentuais ou tendências inventadas.

## Antes de comercializar

Providenciar infraestrutura e backups/restauração, HTTPS, gestão segura de segredos, monitoramento, migrações PostgreSQL, testes de concorrência, revisão de segurança e permissões granulares, recuperação de senha/convites, política de dados e operação do serviço. A conta de demonstração é exclusiva para uso local; não publicar este ambiente com os acessos de demonstração.

## Incremento operacional

Implementados perfis administrador/mecânico, orçamento com dados avulsos, leitura e edição separadas de OS, configurações de taxas e parcelas. O detalhamento de regras, pesquisa de placa, migração e novas rotas está em [04-alteracoes-operacionais.md](04-alteracoes-operacionais.md).

# Conector Horse Power

Código em `extension/horse-power`. Distribuição em `public/downloads/horse-power-conector.zip`, com instruções no LEIA-ME. A pasta original do usuário permanece preservada e não é publicada.

## Fluxo

No editor de orçamento em elaboração, Adicionar produto / Adicionar serviço salva o rascunho e abre o painel de captura. Conectar extensão emite uma credencial aleatória de 30 minutos restrita ao orçamento, oficina, usuário e sessão. A página transmite a credencial ao service worker por uma ponte limitada aos domínios da Horse Power. Não são transmitidas senhas, cookies nem credenciais do banco.

O botão HP • Enviar em cada fornecedor envia somente o item selecionado. O worker valida a origem do emissor, fixa a fonte correspondente e realiza o POST autenticado em `/api/extension/import`. O servidor verifica a sessão original, o papel administrador, o status do orçamento e a placa quando disponível. Encerrar a captura revoga as credenciais do orçamento dentro de uma transação, antes de devolver os itens ao editor.

O token fica em `chrome.storage.session` acessível apenas aos contextos confiáveis da extensão. A fila persistente contém os itens e destino, sem token. Reenvios conservam o identificador de captura. Pendentes não podem migrar para outro orçamento e podem ser reenviados após reconectar o destino original. As gravações do worker são serializadas.

## Dados

- `capture_sessions`: tokens com hash e escopo de escrita limitado.
- `external_catalog_links`: vínculo de código/marca Sky ou nome normalizado Tempario ao catálogo da oficina.
- `external_captures`: recibos de importação, idempotência e referência do item; preservados quando o editor recria os snapshots do orçamento.
- `service_times`: observações de duração em segundos por serviço, marca/modelo/ano/motor, valor original, fonte e data. A placa não faz parte da base de referência de tempos.

Serviços existentes são encontrados por nome normalizado ou alias; preços existentes do catálogo permanecem preservados. Peças recebem sugestão de venda pelas faixas da extensão original, arredondada em centavos. O frete não é capturado. O custo capturado permanece no snapshot do item para o cálculo de lucro. O fornecedor não adiciona estoque à oficina. Antes de finalizar a OS, registre a entrada física de produtos.

Não há varredura integral de catálogos nem consulta a API privada dos fornecedores. Os adaptadores usam dados exibidos no navegador conectado e podem precisar de ajustes quando os sites mudarem. Capturas repetidas do mesmo item no orçamento são ignoradas; quantidades são editadas no sistema. Cliente e veículo não são sobrescritos pela extensão.

A página pública mantém sua lista explícita de campos, sem custos, fontes ou tempos internos. Tabelas novas estão no esquema privado `horse_power`, com RLS e acesso somente pelo papel do backend.

## Verificação

`npm test` cobre importação, normalização, preços, duplicações, concorrência, veículo divergente, papel de mecânico, escopo, expiração por logout, parsing de minutos e fila/reenvios do worker. `scripts/test-extension-cloud.ts` usa uma oficina temporária e remove seus dados ao final. `VERIFY_ORIGIN` inclui chamadas HTTP ao ambiente publicado. Nenhuma consulta paga de placa é utilizada.

A instalação no Chrome e a captura visual nas versões atuais de Sky Peças e Tempario precisam ser confirmadas no navegador onde o usuário acessa os fornecedores.

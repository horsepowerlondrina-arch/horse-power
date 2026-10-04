# Conector Horse Power

Código em `extension/horse-power`. Distribuição em `public/downloads/horse-power-conector.zip`, com instruções no LEIA-ME. A pasta original do usuário permanece preservada e não é publicada.

## Fluxo

No editor de orçamento em elaboração, Adicionar produto / Adicionar serviço salva o rascunho e abre o painel de captura. Conectar extensão emite uma credencial aleatória de 30 minutos restrita ao orçamento, oficina, usuário e sessão. A página transmite a credencial ao service worker por uma ponte limitada aos domínios da Horse Power. Não são transmitidas senhas, cookies nem credenciais do banco.

O botão HP • Enviar em cada fornecedor envia somente o item selecionado. O worker valida a origem do emissor, fixa a fonte correspondente e realiza o POST autenticado em `/api/extension/import`. O servidor verifica a sessão original, o papel administrador, o status do orçamento e a placa quando disponível. Encerrar a captura revoga as credenciais do orçamento dentro de uma transação, antes de devolver os itens ao editor.

O token fica em `chrome.storage.session` acessível apenas aos contextos confiáveis da extensão. A fila persistente contém os itens e destino, sem token. Reenvios conservam o identificador de captura. Pendentes não podem migrar para outro orçamento e podem ser reenviados após reconectar o destino original. As gravações do worker são serializadas.

## Placa automática · versão 1.1

A conexão inclui a placa normalizada do veículo cadastrado; sem vínculo, usa a placa avulsa do orçamento. Placas ausentes ou inválidas não são enviadas. O worker mantém a placa apenas na sessão e a fornece pelo comando `HP_VEHICLE`, limitado à página principal do Tempario e ao popup da própria extensão. O status genérico, acessível ao Sky, não inclui placa nem credencial.

O adaptador aguarda o campo visível e editável de placa, inclusive após login ou navegação interna. Em 03/10/2026, o formulário autenticado observado tinha um input `name="plate"`, label `Placa`, placeholder `Buscar por um veículo` e botão `Buscar`. O preenchimento usa o setter nativo e eventos input/change para atualizar o formulário React. Não clica em Buscar nem consulta APIs de placa.

Há atualização de contexto ao retornar à aba e a cada 2,5 segundos. Cada campo é preenchido uma vez por conexão/placa. Edições manuais são preservadas, com a ação explícita Preencher placa para reaplicar. Campos ambíguos, ocultos, desabilitados e telas de login não são preenchidos. Conexões expiradas ou encerradas deixam de fornecer a placa. O popup permite abrir o Tempario sem incluir placa ou token na URL. Se alterar o veículo no orçamento, encerre a captura e conecte novamente para usar os dados salvos.

## Dados

### Catálogo iniciado pela extensão

Cada oficina pode usar `tenants.catalog_mode='extension'`. Nesse modo, novos produtos e serviços entram apenas pelo conector: o cadastro manual é bloqueado no servidor e os botões de criação levam aos orçamentos. Itens já importados podem ser reutilizados, ter seus preços ajustados e receber movimentações de estoque normalmente.

`catalog.archived_at` separa o catálogo anterior do catálogo atual. A limpeza mantém os IDs históricos e os snapshots de nomes, quantidades, custos e preços das OS; não altera clientes, veículos, financeiro ou estoque histórico. Itens arquivados não aparecem nas buscas, nem no filtro Todos, e não podem ser reativados pelo cadastro. Uma OS antiga pode preservar/editar seus próprios itens, mas eles não podem ser adicionados a outro documento. Capturas novas não reutilizam os cadastros arquivados. Os tempos associados ao catálogo anterior também ficam fora da lista atual.

`scripts/reset-catalog.ts` é uma operação de manutenção sem endpoint público: exige oficina e e-mail do administrador, simula por padrão e só aplica com `--apply`. Antes de aplicar, grava backup privado em `data/backups` (fora do Git e da publicação). Dentro de uma transação, arquiva o catálogo, limpa aliases e vínculos de busca antigos, revoga conexões de captura e ativa o modo de extensão. Compara contagens e hashes dos dados operacionais antes/depois, revertendo se houver alteração. Execuções posteriores preservam os novos itens importados. A extensão deve ser reconectada após essa operação.

- `capture_sessions`: tokens com hash e escopo de escrita limitado.
- `external_catalog_links`: vínculo de código/marca Sky ou nome normalizado Tempario ao catálogo da oficina.
- `external_captures`: recibos de importação, idempotência e referência do item; preservados quando o editor recria os snapshots do orçamento.
- `service_times`: observações de duração em segundos por serviço, marca/modelo/ano/motor, valor original, fonte e data. A placa não faz parte da base de referência de tempos.

Serviços existentes são encontrados por nome normalizado ou alias; preços existentes do catálogo permanecem preservados. Peças recebem sugestão de venda pelas faixas da extensão original, arredondada em centavos. O frete não é capturado. O custo capturado permanece no snapshot do item para o cálculo de lucro. O fornecedor não adiciona estoque à oficina. Antes de finalizar a OS, registre a entrada física de produtos.

Não há varredura integral de catálogos nem consulta a API privada dos fornecedores. Os adaptadores usam dados exibidos no navegador conectado e podem precisar de ajustes quando os sites mudarem. Capturas repetidas do mesmo item no orçamento são ignoradas; quantidades são editadas no sistema. Cliente e veículo não são sobrescritos pela extensão.

A página pública mantém sua lista explícita de campos, sem custos, fontes ou tempos internos. Tabelas novas estão no esquema privado `horse_power`, com RLS e acesso somente pelo papel do backend.

## Verificação

`npm test` cobre importação, normalização, preços, duplicações, concorrência, veículo divergente, papel de mecânico, escopo, expiração por logout, parsing de minutos e fila/reenvios do worker. `scripts/test-extension-cloud.ts` usa uma oficina temporária e remove seus dados ao final. `VERIFY_ORIGIN` inclui chamadas HTTP ao ambiente publicado. Nenhuma consulta paga de placa é utilizada.

Os testes de placa cobrem vínculo ao veículo cadastrado, placa avulsa, normalização, valores inválidos, atualização na reconexão, expiração, origem/frame autorizados e ausência da placa em status/URL.

Verificação no navegador em formulário React com os atributos observados no Tempario: montagem tardia do campo, reconhecimento da placa pelo estado do formulário, preservação da edição manual, reaplicação pelo botão, troca de conexão e desconexão. O contador de consultas permaneceu em zero. O adaptador instalado na página autenticada do fornecedor ainda precisa ser confirmado após atualizar a extensão.

A instalação no Chrome e a captura visual nas versões atuais de Sky Peças e Tempario precisam ser confirmadas no navegador onde o usuário acessa os fornecedores.

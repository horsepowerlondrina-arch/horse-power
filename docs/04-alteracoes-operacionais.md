# Atendimento, acessos e recebimentos

## Fluxos implementados

- Dashboard: faturamento de peças, lucro bruto das peças, faturamento de serviços e recebimentos líquidos. O faturamento é reconhecido na conclusão da OS, com filtro de período no fuso de São Paulo. Desconto distribuído proporcionalmente entre peças e serviços; lucro bruto das peças = receita das peças após desconto − custo histórico dos itens. Taxas e outras despesas não compõem esse lucro bruto.
- Orçamento pode ser salvo sem cliente e sem veículo cadastrados. Nome, placa e descrição avulsos são opcionais. Para aprovar e transformar em OS, o administrador vincula cliente e veículo. Cancelamento preserva o tipo do documento, mantendo o orçamento na sua lista e no filtro de cancelados.
- OS: visualização simples, edição separada e observações para a equipe. Finalizar baixa o estoque, gera o recebível e abre a tela de recebimento. Serviço concluído com saldo permanece como **A receber** na consulta padrão. Quitação da última parcela retira a OS da consulta padrão; filtros **Finalizada** ou **Todas as situações** a recuperam. OS canceladas ficam no filtro correspondente.
- Produtos e serviços têm abas próprias no catálogo e na edição do atendimento. Ambos podem ser cadastrados em janela sobre a OS e já adicionados ao atendimento.
- Cliente e veículo podem ser cadastrados na mesma janela, em uma única transação. Se o veículo não puder ser salvo, o cliente também não é criado. No atendimento, ambos ficam selecionados automaticamente.
- Administrador: cadastros, valores, estoque, financeiro e configurações. Mecânico: lista e leitura das OS, iniciar execução, marcar como pronta e atualizar observações em OS em andamento. Custos, preços, totais e recebimentos não são enviados na resposta de dados do mecânico. O servidor rejeita ações administrativas, inclusive chamadas diretas à API.

## Taxas e parcelas

Taxa da operadora e juros do cliente são separados. As configurações padrão pertencem à oficina e podem ser ajustadas ao definir o pagamento de uma OS.

- Juros: percentual **total do parcelamento**, aplicado uma vez sobre o valor da OS; não é uma taxa mensal composta.
- Total do cliente = valor da OS + juros.
- Taxa da oficina = percentual da operadora × total do cliente.
- Líquido da oficina = total do cliente − taxa.
- Pix, dinheiro, débito e transferência são à vista. Crédito e boleto admitem até 24 parcelas; taxa de cartão só existe no débito/crédito e juros só no parcelamento.
- Valores em centavos. Resíduos de divisão são distribuídos entre as parcelas preservando os totais. Vencimentos mensais respeitam o último dia de meses curtos.
- Salvar condições não gera caixa. Cada parcela exige confirmação de recebimento; somente seu líquido entra no caixa, com bruto e taxa registrados separadamente. Não há captura bancária ou cobrança automática.
- Plano não pode ser alterado após qualquer recebimento. Estornos, adiantamentos e pagamentos com múltiplas formas ficam para outra etapa.

Exemplo: OS de R$ 100,00, juros totais de 10% e taxa da operadora de 3,5% → cliente paga R$ 110,00; taxa de R$ 3,85; oficina recebe líquido de R$ 106,15.

## Consulta por placa: pesquisa e ativação

A consulta primeiro procura o veículo **somente na oficina ativa**. Na edição da OS, encontrar um veículo local seleciona cliente, veículo e quilometragem. Sem cadastro local, pode consultar o provedor externo e sugerir marca, modelo, ano e cor para conferência.

A documentação da [Placa FIPE](https://doc.placafipe.com.br/api/getplaca.html) descreve `POST https://api.placafipe.com.br/getplaca`, com `placa` e `token` no corpo. O token depende de um plano; consultas consomem a quota contratada, conforme [visão geral da API](https://doc.placafipe.com.br/api/). O conector está preparado, com limite por oficina e tratamento de indisponibilidade, mas não foi ativado nem validado com uma credencial real.

A alternativa oficial [Consulta Senatran do Serpro](https://centraldeajuda.serpro.gov.br/consultasenatran/comofunciona/) exige credenciamento, autorização e contratação; não é um serviço anônimo gratuito. Sua [documentação técnica](https://wsdenatran.serpro.gov.br/api-doc/) prevê autenticação própria. Não foi integrada nesta etapa.

Para ativar Placa FIPE, contratar uma conta e configurar no servidor o JSON `PLACA_FIPE_TOKENS_JSON`, com a chave igual ao identificador da oficina e valor igual ao token. `.env.example` mostra a estrutura; `.env` é lido no início da execução. Nunca colocar o token em variáveis `VITE_` ou no navegador. Reiniciar o servidor após configurar. Sem token, o formulário informa a indisponibilidade externa e permite preenchimento manual.

Somente dados descritivos do veículo são aceitos do provedor. Dados pessoais de proprietário não são importados. A resposta precisa ser conferida antes de salvar.

## Migração e dados antigos

Migração 002 preserva os registros e os vínculos existentes. Recebimentos antigos quitados viram uma parcela paga, sem inventar taxas ou juros passados. Caixa antigo mantém os valores. Uma cópia anterior está em `data/backups/pre-alteracoes-1789840131267.sqlite`.

O atendimento cancelado #1010 da Horse Power Centro não guarda informação suficiente para determinar se era orçamento ou OS no esquema anterior. Permaneceu na classificação legada de OS, sem presumir uma origem. Novos cancelamentos preservam o tipo corretamente.

## Rotas e arquivos

- `/ordens/:id`: leitura da OS ou orçamento salvo.
- `/ordens/:id/editar`: edição administrativa.
- `/ordens/:id/receber`: condições, parcelas e confirmações.
- `/ordens/nova` e `/orcamentos/novo`: novos atendimentos.
- `/configuracoes`: taxas padrão por oficina.
- Domínio de pagamento: `server/domain/payments.ts`.
- Transações financeiras: `server/services/payments.ts`.
- Consulta por placa: `server/services/vehicleLookup.ts`.
- Migração: `server/db/migrations/002-workflows.sql`.


## FipePlaca ativado na instalação local

O conector FipePlaca usa `https://api.fipeplaca.com.br/gateway/v1`, conforme o endereço fornecido pelo titular da conta, com autenticação Bearer exclusivamente no servidor. O endpoint gratuito `/saldo` respondeu HTTP 200 e confirmou R$ 30,00. Nenhuma consulta paga de veículo foi usada nesta ativação.

A chave fica em `.env`, com permissão 600 e exclusão no `.gitignore`, no mapa `FIPEPLACA_TOKENS_JSON`, vinculada somente a `hp-centro`. Nenhuma chave é incluída no código, no build ou na documentação. Quando configurado, este provedor tem prioridade sobre o conector antigo Placa FIPE.

Campos aceitos: marca, modelo, ano-modelo (ou fabricação quando ausente) e cor. Dados nulos não inventam valores nem sobrescrevem campos manuais. Saldo insuficiente, chave inválida e indisponibilidade são tratados com mensagens locais, sem repassar conteúdo bruto do provedor. Chamadas usam HTTPS, não seguem redirecionamentos e não repetem automaticamente consultas pagas.

Validação: autenticação e saldo verificados ao vivo; mapeamento de veículos, ausência de dados, erros e isolamento por oficina verificados com respostas simuladas. Suíte com 20 testes aprovados e build concluído.

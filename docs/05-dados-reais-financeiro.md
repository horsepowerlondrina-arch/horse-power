# Horse Power: dados reais e financeiro

## Importação aplicada

Foram lidos os 236 PDFs operacionais (231 OS individuais, clientes, veículos, relatório geral, relatório de lucro e tabela de taxas) e a planilha `Gastos Oficina.xlsx`. Os arquivos originais permanecem intactos. Extração intermediária local em `tmp/import`, excluída do controle de versão.

- 231 OS, todas finalizadas, total R$ 195.065,63. Números e valores conferem individualmente com as 231 linhas do relatório geral. Itens × quantidades − desconto conferem em todas as OS, sem diferenças.
- 119 clientes: 100 do relatório de clientes e 19 complementados pelas OS. Deduplicação por nome normalizado, sem juntar pessoas apenas por telefone.
- 143 veículos: 99 do relatório de veículos e complementação pelas placas das OS. Dados com ano ausente permanecem não informados (44 registros). A placa AUM065 da OS 260 já está incompleta no original e foi preservada; precisa ser corrigida no cadastro pelo proprietário, sem consulta paga automática.
- 1.214 linhas de itens nas OS; catálogo de 609 produtos e 223 serviços. Preços do catálogo refletem a última ocorrência cronológica encontrada; os preços de cada OS permanecem preservados.
- Os custos de produtos e serviços por OS foram recuperados do relatório de lucro. O dashboard usa o custo agregado histórico de produtos para calcular o lucro bruto. Custos unitários e saldo físico atual não constam dos PDFs: aparecem a conferir no catálogo/estoque. Nenhuma venda antiga baixou estoque atual.
- Formas de pagamento originais foram preservadas como histórico. “Finalizada” não comprova quitação: não foram criados recebimentos nem baixas de caixa para essas OS.
- As OS históricas ficam no filtro Finalizada/Todas. Novas OS seguem a numeração acima do maior número importado.

Os dados de demonstração foram arquivados sem acesso pelos usuários atuais. Só há vínculo operacional com hp-centro, agora Horse Power Car Service. A arquitetura por empresa foi mantida. Backup anterior em `data/backups/pre-real-*.sqlite`; lote idempotente `minha-oficina-2026-09-19` em `import_batches`. Não executar importação por cima do lote nem restaurar sem preservar os dados produzidos depois dela.

## Gastos

Planilha Página1, linhas 4–17: 12 fixos (R$ 15.685,10/mês), 14 investimentos (R$ 1.588,03/mês, R$ 8.958,03 de parcelas restantes) e 3 variáveis sem valor. Total mensal conhecido R$ 17.273,13. Linhas de total não foram importadas como contas. Investimentos repetidos com o mesmo nome foram mantidos distintos porque têm valores e prazos diferentes.

O mês inicial e as quitações não estão no arquivo. Os 29 registros entram em Planejamento, sem inventar vencimentos completos ou pagamentos. Ao definir o primeiro mês, Gerar contas cria as contas em aberto. Recorrentes podem ser geradas nos meses seguintes; investimentos respeitam o número de meses restante. Índice único impede duplicação mesmo se o dia do vencimento mudar. Valores ausentes são ignorados até serem informados. Geração mensal é explícita, não um agendamento externo.

Contas em aberto podem ser editadas, pagas ou canceladas. Pagamento é confirmado com data e forma; repetir a baixa é recusado. Caixa soma recebimentos líquidos e desconta apenas contas efetivamente pagas, conforme a data do pagamento. Saldo bancário inicial não foi informado e não é presumido.

## Cartão

Tabela Inter: débito 0,84%; crédito 1–12x: 3,53%, 4,51%, 5,27%, 6,03%, 6,79%, 7,55%, 8,73%, 9,49%, 10,25%, 11,01%, 11,77%, 12,53%.

A opção Repassar taxa calcula o bruto pela divisão do líquido desejado por (1 − taxa), com arredondamento em centavos; isso evita perda por multiplicadores arredondados do PDF. A tela mantém separados valor da OS, juros adicionais do cliente, repasse do cartão, taxa da operadora e líquido. A tabela importada aparece nas configurações. Os juros adicionais são zero por padrão.

## WhatsApp e página do cliente

A visualização tem botão WhatsApp para orçamento pronto, serviço concluído e atualização. A oficina pode revisar o telefone e editar a mensagem. Nada é enviado automaticamente.

A página /p/:token dispensa login e exibe primeiro nome, veículo, placa, situação, produtos, serviços, quantidades, preços, desconto e total. Custos internos, documentos, telefones do cliente e notas internas não são retornados. Links usam 256 bits aleatórios; somente o hash fica no banco, expiram em 30 dias, podem ser desativados e são substituídos ao gerar outro. Resposta sem cache, sem indexação e sem referrer.

O sistema permanece local. Para uso externo será necessário publicar o sistema com login definitivo e configurar PUBLIC_ORIGIN. Enquanto não houver endereço público, a prévia funciona localmente e o envio de link é sinalizado como indisponível. A implantação externa não foi realizada nem houve envio a clientes.

## Validação

Reconciliação de todos os totais e vínculos da importação; integridade SQLite; testes de domínio/API/migração, incluindo repasse em centavos, geração idempotente, quitação única, isolamento financeiro, papéis, expiração/revogação e campos públicos permitidos. Verificação visual da identidade, planejamento e página do cliente em 390 px. Testes usam bancos isolados, sem despesas fictícias no financeiro real.

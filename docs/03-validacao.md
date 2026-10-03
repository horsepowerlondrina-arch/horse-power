# Validação da primeira fase

Verificada em 19/09/2026 no ambiente local. Os dados usados abaixo são fictícios e pertencem à Oficina Norte de demonstração.

## Testes automatizados

Nove testes aprovados de domínio, persistência e API:

1. Cálculo exato em centavos e limite de desconto.
2. Orçamento sem efeito em estoque; aprovação/conclusão geram um único recebível e movimento. Edição posterior à conclusão é bloqueada.
3. Estoque insuficiente reverte a transação inteira, inclusive baixas de itens anteriores.
4. Recebimento integral cria uma única entrada no caixa; repetição é recusada.
5. Cliente, catálogo e veículo de outra oficina não podem ser vinculados; veículo de outro cliente também é recusado.
6. Cancelamento preserva o histórico e impede reabertura/edição nesta fase.
7. Alterar preço do catálogo não modifica o preço já salvo em um atendimento.
8. Registro permanece após fechar e reabrir o banco SQLite.
9. API exige sessão, recusa troca para oficina não autorizada, bloqueia alteração cruzada, rejeita datas inválidas/quantidades negativas/origem não autorizada e revoga a sessão no logout.

## Fluxos verificados no navegador

- Login de demonstração e carregamento do dashboard.
- Troca Centro → Norte com listagens separadas.
- Cadastro de `Cliente de validação` e veículo Honda Fit `TST1A23`.
- Novo orçamento com troca de óleo e filtros (R$ 120), filtro de óleo (R$ 35), profissional Carlos Mendes e desconto de R$ 5: total R$ 150.
- Persistência do orçamento após recarregar a página.
- Aprovação, execução, pronta para entrega e conclusão, permanecendo na tela do atendimento.
- Recebível automático de R$ 150 e registro de recebimento de demonstração por Pix no caixa.
- Estoque do filtro diminuiu de 18 para 17; reposição manual justificada elevou novamente para 18.
- Cadastro rápido de cliente e veículo dentro da OS. Cliente selecionado automaticamente; veículo `QAT1A23` selecionado com os 76.543 km informados, sem abandonar o formulário.
- Dashboard móvel em 390 × 844 e navegação pela sidebar recolhida.

A versão compilada passa na verificação TypeScript e no build Vite. A validação não equivale a auditoria de segurança, ensaio de carga ou certificação para produção. Impressão possui layout próprio; a integração com impressoras físicas não foi testada. Relatórios fiscais, e-mail, pagamentos reais e módulos futuros não foram testados porque não foram implementados.

## Incremento: atendimento, mecânico e parcelas

A suíte passou a 16 testes, incluindo migração do esquema anterior, orçamento avulso e cancelado, preservação de custo histórico, cálculo com taxas e juros, arredondamentos extremos, datas em meses curtos, recebimento parcial, quitação e filtros. A API foi testada para criação conjunta atômica, acesso de mecânico, isolamento entre oficinas e respostas do provedor de placa simuladas sem expor credenciais.

No navegador, em Horse Power Centro, com dados fictícios:

- Orçamento #1011 salvo sem cliente/veículo cadastrado e cancelado; preservado na lista padrão de orçamentos e no filtro de cancelados.
- Cliente `Validação · cliente e veículo` e Honda Fit `VLD1A23`, 65.432 km, criados juntos dentro de uma nova OS; cliente, veículo e km selecionados automaticamente.
- Produto `Peça de validação` (custo R$ 40, venda R$ 100, estoque inicial 5) e `Serviço de validação` (R$ 150) criados em suas abas dentro da OS e adicionados imediatamente.
- OS #1012 salva por R$ 250 com observações para a equipe. Leitura separada da edição.
- Login como mecânico Carlos Mendes: tela sem valores; execução e pronta para entrega confirmadas. Tentativa de acessar Financeiro redirecionada à lista de OS. A restrição também foi testada diretamente na API.
- Administrador finalizou #1012 e chegou diretamente ao recebimento. Três parcelas, juros totais de 10% e taxa de cartão de 3,5%: cliente R$ 275,00, taxa R$ 9,63, líquido R$ 265,37.
- Primeira parcela de R$ 91,67 gerou R$ 88,46 líquidos; OS permaneceu **A receber** na consulta padrão. As três parcelas quitadas resultaram em saldo zero e a OS saiu da consulta padrão, reaparecendo com filtro **Finalizada**.
- Consulta pela placa `VLD1A23` na nova OS selecionou o cliente, o veículo e os 65.432 km do cadastro local. Catálogo conferido na aba Serviços.
- Leitura da OS conferida em 390 × 844, com menu recolhido e cards empilhados. Nenhum erro de console observado na validação.
- Banco real preservado: verificação de integridade retornou `ok`, sem violações de chaves estrangeiras após a migração. Os seis recebimentos antigos viraram parcelas legadas, mantendo os valores.

Consulta externa real por placa não foi executada: não há token contratado configurado. O conector foi validado com respostas simuladas; a busca no cadastro da oficina funciona sem provedor externo.

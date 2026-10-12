# Fornecedores

Cadastros > Fornecedores permite incluir e editar fornecedores, pesquisar nome, CPF/CNPJ e contato e filtrar ativos/inativos. Nome é obrigatório; CPF/CNPJ é opcional, normalizado e único por oficina. Inativar preserva notas e vínculos. Somente administradores podem acessar esses dados e operações.

A prévia da NF-e identifica pelo CNPJ e preenche os dados disponíveis no XML. Dados já editados são preservados; campos vazios podem ser preenchidos pela nota. A conferência permite alterar dados antes da importação. O cadastro só é gravado na mesma transação que confirma a nota: falhas revertem também a criação/edição do fornecedor e notas duplicadas não provocam novas alterações.

O código e unidade de cada fornecedor continuam em stock_invoice_products, com ligação ao cadastro do fornecedor. Produtos podem ter vários fornecedores; marca e fornecedor permanecem separados. Último custo por unidade de estoque inclui frete e encargos conforme o cálculo da nota e fica separado por código/unidade. Notas mais antigas não substituem esse último custo. Vínculos históricos sem custo/data disponíveis permanecem como não informados.

Migração 019 para SQLite e supplier_registry para PostgreSQL criam os cadastros e associam as notas/vínculos já existentes. Não alteram quantidades, preços ou documentos históricos. A tabela fica no esquema privado horse_power com RLS e acesso exclusivo do papel interno do backend.

Os quatro fornecedores identificados nos documentos enviados foram pré-cadastrados na oficina de produção. Os XMLs originais não estavam disponíveis nos caminhos locais nesta execução; somente nomes e CNPJs confirmados foram usados, com nome fantasia para facilitar a busca. Contatos/endereços não foram inventados e podem ser completados por edição ou conferência de nova nota.

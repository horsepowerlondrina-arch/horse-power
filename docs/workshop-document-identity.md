# Identidade da oficina e documentos

Configurações > Dados da oficina permite editar nome, razão social, CPF/CNPJ, telefone/WhatsApp, e-mail, endereço, cidade, UF e logotipo. Somente administradores podem gravar, e a solicitação do formulário identifica a oficina esperada para impedir salvar um rascunho após trocar de oficina.

As imagens PNG, JPG e WebP são preparadas pelo navegador para um PNG limitado a 200 KiB e 1200 pixels. O servidor valida assinatura, dimensões, estrutura, CRCs e conteúdo descomprimido, bloqueando URLs externas, SVG e arquivos corrompidos. O logotipo fica vinculado à oficina no banco, sem credenciais públicas de armazenamento ou serviço adicional.

OS, orçamentos e checklists usam DocumentHeader. A página pública usa o mesmo OrderPrint em modo público, com o mesmo padrão de cabeçalho, itens e totais, preservando o conjunto de informações anteriormente compartilhado. Custos, observações internas, endereço/documento/telefone do cliente e assinaturas internas não são renderizados na página pública.

Dados da oficina são lidos ao emitir/imprimir ou abrir o link; documentos emitidos novamente refletem as configurações atuais. Mensagens de compartilhamento usam o nome configurado. A migração inicial mantém os dados existentes da Horse Power e adiciona o e-mail comercial, cidade/UF e o logotipo já usado na OS. Não muda preços, estoque, pagamentos, usuários ou senhas.

A aparência de acesso ao sistema e o site institucional continuam com sua identidade atual; personalização completa da plataforma pode ser acrescentada depois. O CSS dos documentos é separado e compartilhado entre tela, A4 e página do cliente, com adaptação para celular e cabeçalhos de tabela repetidos na impressão.

Validação: testes de autorização/isolamento, edição sem efeitos nos registros de negócio, logos inválidos, atualização de links existentes e HTML renderizado dos três documentos. Prévias locais de impressão A4 e cliente em celular foram conferidas visualmente.

# Publicação Horse Power — Supabase e Vercel

O servidor usa PostgreSQL no Supabase em produção; SQLite permanece disponível para desenvolvimento e testes locais. As regras de negócio são compartilhadas e assíncronas, com transações reais. Na nuvem, um bloqueio transacional coordena gravações críticas entre instâncias para impedir numeração repetida, finalização duplicada e recebimentos concorrentes. Esse bloqueio global prioriza consistência na instalação inicial; poderá ser dividido por oficina ao expandir.

## Destinos

- GitHub privado: `horsepowerlondrina-arch/horse-power`.
- Vercel: equipe `horse-power2`, projeto `horse-power`.
- Supabase: organização Horse Power, projeto `cbdwgocofigrdigfgwkp`, região Canada Central.
- Banco: esquema privado `horse_power`, fora da Data API. Tabelas com RLS e política exclusiva para o papel interno `horse_power_app`. O acesso dos usuários continua passando pela autenticação e autorização do servidor, com vínculos de oficina e papel administrador/mecânico. A política interna não deve ser concedida a `anon` ou `authenticated`.

## Dados e acesso

A importação usa um backup consistente do SQLite. Só os registros da oficina `hp-centro` são exportados; a oficina de demonstração arquivada não é importada. Sessões antigas e links públicos locais não são transferidos. As senhas provisórias são inutilizadas na nuvem e apenas o administrador recebe vínculo ativo inicial. O histórico de autoria permanece preservado.

Administrador: `horsepowerlondrina@gmail.com`. A ativação utiliza token aleatório de uso único, armazenado somente como hash, com validade limitada. A senha é definida pelo usuário na página `/ativar`, nunca no repositório. O token vai no fragmento do URL e é removido da barra de endereço após abrir a página. Limites de tentativas de login persistem no banco.

A planilha de gastos continua como planejamento: não foram inventados meses de início, contas vencidas ou pagamentos.

## Configuração

- `DATABASE_URL`: segredo do servidor com usuário restrito e transaction pooler porta 6543. TLS verifica o certificado público do Supabase, incluído em `server/db/certs`.
- `FIPEPLACA_TOKENS_JSON`: segredo do servidor já utilizado pela oficina; nenhuma consulta paga faz parte dos testes.
- `APP_ORIGIN` e `PUBLIC_ORIGIN`: domínio oficial, ou domínio de produção fornecido pela Vercel.
- `.env.production.local`, `data/` e temporários Supabase são ignorados por Git e Vercel.
- A publicação da Vercel usa Node 24 e a região próxima do banco. O frontend utiliza `/api` na mesma origem, cookies HttpOnly e Secure em produção.

## Validação e recuperação

`npm run build` e `npm test` validam TypeScript, frontend e regras locais. `scripts/test-cloud.ts` verifica os fluxos reais contra PostgreSQL em uma oficina temporária, excluída no fim. `scripts/verify-cloud.ts` compara campos e valores com o arquivo local de expectativa da importação; não deve ser usado para exigir igualdade depois que a oficina começar a operar online.

`scripts/prepare-cloud.py` prepara backup e importação privada, não publica dados. O SQL de importação exige destino vazio e é executado em uma transação; não deve ser reexecutado sobre uma instalação em uso. O esquema inicial foi criado com as ferramentas do Supabase e está versionado em `supabase/migrations`. Mudanças futuras precisam de migrações incrementais revisadas. Dados pessoais e credenciais não fazem parte das migrações versionadas.

O banco local e seus backups permanecem preservados. Depois de iniciar operações online, o Supabase deve ser a fonte principal: não reimportar o SQLite antigo sobre os novos lançamentos. A política operacional de backups contínuos do serviço deverá ser definida conforme o plano contratado.

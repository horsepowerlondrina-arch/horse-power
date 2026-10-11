# Site público e sistema de gestão

O site enviado em Horse-Power-Projeto-Completo-v02.zip contém uma versão estática pronta em publicacao/. Esses arquivos estão em public/site, com caminhos de recursos ajustados, URLs canônicas e acesso ao sistema no rodapé. O build Vite copia os arquivos; não depende do build Astro do projeto enviado.

oficinahorsepower.com.br/ e /contato mostram o site público. /inicio e os demais caminhos do sistema continuam servindo a aplicação de gestão, mantendo cookies, APIs, extensão e links existentes. horse-power.vercel.app continua servindo o sistema inclusive na raiz. /privacidade e /downloads continuam disponíveis.

O build renomeia dist/index.html para dist/app.html para que a raiz pública não seja interceptada pelo arquivo index.html da aplicação antes da regra de domínio na Vercel.

## Endereço separado pendente

sistema.oficinahorsepower.com.br foi associado ao mesmo projeto Vercel, e a origem foi autorizada no backend. O endereço ainda depende do DNS externo no Registro.br: CNAME sistema apontando para 718e1084a7d42468.vercel-dns-017.com.

Após ativar DNS e HTTPS, atualizar a extensão com a permissão exata do novo endereço, reconstruir o ZIP e solicitar publicação pelo fluxo já configurado. Somente depois de validar a extensão, alterar o acesso no rodapé e PUBLIC_ORIGIN para o subdomínio. O cookie é específico de cada host, então o novo endereço exige novo login. Os dados permanecem no mesmo banco.

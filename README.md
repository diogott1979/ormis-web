# ORMIS — Automação de rotas

Interface web estática (protótipo): GitHub Pages + ArcGIS Enterprise REST.

## Instalação
1. Colocar `index.html`, `styles.css`, `app.js` e `ormis_rota.js` na raiz do repositório.
2. Settings → Pages → Deploy from a branch → main / (root) → Save.
3. Registar o endereço HTTPS do GitHub Pages como **Redirect URI autorizado** da aplicação OAuth no Portal Enterprise (precisa de permissão administrativa e aprovação organizacional).
4. Abrir o GitHub Pages, introduzir apenas o **Client ID OAuth público** (nunca Client Secret), iniciar sessão e testar com uma ORMIS de teste em modo simulação.

## Limitações
- Requer que o ArcGIS Enterprise aceite a origem GitHub Pages através de CORS, autenticação OAuth e políticas de segurança (incluindo CSP/iframe se embebido no Experience Builder).
- Não é um webhook nem reage automaticamente à submissão do Survey123; depende de uma ação no navegador.
- Esta versão apenas trata da rota. O relatório PDF completo ainda não está implementado.
- Não guardar credenciais/tokens nem dados de missões no repositório público.
- Não ativar a escrita em produção sem validar geometrias e campos dos serviços.

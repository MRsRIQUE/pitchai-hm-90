## O que está acontecendo

Três problemas confirmados na leitura do código:

1. **O .zip que você baixou está velho.** O `public/pitchai-extension.zip` foi empacotado antes da última alteração: o `panel.html` dentro dele não tem o seletor de produtos do auto-fixar (por isso o card na sua imagem aparece só com "nome/termo do produto"). O código no projeto já tem o seletor; o pacote não.
2. **Marcar o produto não garante o rodízio.** O painel grava `autoFixar.ids` gravando a config inteira, e o loop de raspagem (a cada 2s) também regrava a config inteira a partir de uma cópia carregada antes — a marcação pode ser sobrescrita. Além disso não há nenhum retorno visual de quais produtos estão no rodízio.
3. **Aviso confuso + IA sem credencial.** O texto `⚠ sem msgs há Infinitys (via auto-scan)` vem de um cálculo com `Infinity` quando nunca chegou mensagem. E quando não há Sync token colado, as chamadas de IA/voz saem sem `Authorization` e voltam 401 — hoje isso só aparece como um item "failed" discreto na fila.

## O que vou fazer

### 1. Auto-fixar confiável

- Gravação incremental: painel e conteúdo passam a atualizar apenas as chaves alteradas (`autoFixar`, flags de produto) relendo a config no momento do save, em vez de sobrescrever o objeto inteiro — acaba a corrida com o loop de raspagem.
- Unificar as duas marcações do card "Produtos" (checkbox de rodízio + switch de ativo) numa só coluna clara, com rótulo "no rodízio".
- No card "Auto-fixar produto": lista os produtos marcados em tempo real ("Rodízio: 3 produtos — A, B, C") e, se nenhum estiver marcado, avisa "roda todos os produtos da vitrine".
- O rodízio passa a casar produto por `pid`/nome normalizado, não só por `id`, para não perder a marcação quando a vitrine é relida.

### 2. Avisos mais simples

- Sem `Infinity`: quando nunca chegou mensagem, mostra "aguardando primeira mensagem do chat".
- Textos curtos e em linguagem comum: "chat ok", "chat parado há 2 min", "chat não encontrado — aponte a área do chat".

### 3. Credenciais da IA

- Se não houver Sync token: badge fixa e clicável na barra ("IA desligada — falta o Sync token") que abre direto o card de Sincronização do painel.
- O card de Sincronização ganha estado visual (conectado / não conectado) e a instrução em uma frase de onde copiar o token no painel web.
- Em erro 401/403, mensagem única e clara em vez de "token inválido" solto na fila.

### 4. Republicar o pacote

- Subir a versão para **v0.14.4** (`manifest.json`, `panel.html`, `src/lib/live/version.ts`) e regerar o `public/pitchai-extension.zip` para que o download traga tudo isso.

## Detalhes técnicos

Arquivos: `extension/panel.html`, `extension/panel.js`, `extension/content.js`, `extension/manifest.json`, `src/lib/live/version.ts`, reempacotamento do zip em `public/`. Nenhuma mudança de banco ou de billing.

Depois de aplicar, você precisa **rebaixar o .zip e recarregar a extensão** em `chrome://extensions` para ver as mudanças.

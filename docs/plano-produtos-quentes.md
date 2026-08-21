# Plano Produtos Quentes (conta mestre)

**Data:** 19/08/2026
**Objetivo:** Criar a aba "Produtos Quentes" no painel, alimentada pela vitrine de uma conta mestre, visível para todas as contas.

---

## Pesquisa (realizada por 3 agentes no codebase)

### Como os produtos chegam ao site hoje

```
hook.js (intercepta fetch/XHR da página do TikTok)
  → postMessage __pitchai_net__ (product_name, price_str, sku_list)
content.js (scrapeCatalog: rede + leitura DOM da vitrine)
  → POST /api/public/live/config
  → Firestore live_configs_by_token/{sync_token}
  → site: useVitrineSync puxa a cada 20s
```

**Arquivos-chave:**

| Peça                           | Local                                              |
| ------------------------------ | -------------------------------------------------- |
| Captura de rede (fetch/XHR/WS) | `extension/hook.js:9, 244-312, 75-131`             |
| Leitura DOM + merge rede       | `extension/content.js:2021-2290, 4239-4320`        |
| Push da config                 | `extension/content.js:1060-1075`                   |
| Rota push/pull                 | `src/routes/api/public/live/config.ts:8-70`        |
| Token e pull no site           | `src/lib/live/sync.ts:55-92, 230-279`              |
| Auto-sync 20s                  | `src/hooks/live/useVitrineSync.ts:97-206, 235-265` |
| Doc compartilhado              | Firestore `live_configs_by_token/{sync_token}`     |

### Sobre a API oficial do TikTok

- **Não usamos nenhuma API oficial hoje** — tudo é scraping via extensão, sem credenciais.
- Únicos OAuth reais no projeto: Google (Firebase) e Stripe.
- A API oficial (TikTok Shop Open Platform) exige criação e **aprovação de app** — processo que pode levar semanas. Não recomendada como caminho inicial.

### Viabilidade de extensão paralela (análise do agente A2)

Viável **somente se read-only**. Se rodar a extensão completa junto na mesma aba, colide em:

1. Globals de `window` compartilhados sem namespace
2. `chrome.storage.local` — mesma key `pitchai.config.v1`, última escrita vence
3. `sessionStart()` (`content.js:1133`) — duas sessões para o mesmo token, dupla contagem
4. `postMessage __pitchai_net__` — mensagens duplicadas/da extensão errada

Requisitos de uma 2ª extensão segura: sem `hook.js` completo, sem `sessionStart`, storage key própria (`pitchaiV.*`), doc Firestore próprio, sem `postMessage`.

---

## Fase 1 — MVP sem extensão nova (recomendado)

A vitrine da conta mestre **já chega** ao painel dela pela extensão atual.

1. **Site:** nova aba "Produtos Quentes" no dashboard (lê coleção Firestore `hot_products`).
2. **Conta mestre:** allowlist validada no backend; na aba Produtos dela, botão "Enviar para Quentes" por produto.
3. **Sincronização:** `useVitrineSync` já traz a vitrine da mestre → ela promove produtos para `hot_products`.
4. **Demais contas:** veem a lista quente (read-only) com botão "Adicionar ao meu catálogo" (copia para `config.produtos` delas).

**Vantagens:** zero risco de conflito entre extensões, zero burocracia com a TikTok, reusa o pipeline que já existe.

## Fase 2 — se a conta mestre for outra conta TikTok

- **Opção A (mais barata):** modo "somente vitrine" NA extensão atual — só roda `scrapeCatalog` + push para `/api/public/hot-products` com token de mestre, sem iniciar chat/sessão.
- **Opção B:** 2ª extensão Chrome read-only (requisitos de segurança acima) — mais manutenção.

## Regras de segurança (Firestore)

- `hot_products`: o backend escreve com service account; todas as contas autenticadas leem pela API.
- O papel de mestre aceita `MASTER_UIDS`, `MASTER_EMAILS` verificados e a allowlist interna do produto.

## Riscos

- 2 extensões completas na mesma aba = colisão de globals/storage/sessão — evitar.
- Limites do Firestore: usar paginação/limite na leitura de `hot_products`.

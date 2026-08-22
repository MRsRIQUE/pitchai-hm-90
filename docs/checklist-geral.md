# Checklist Geral — Pitch AI (site + extensão)

**Data:** 19/08/2026 · **Versão extensão:** 0.18.21 · **Produção:** https://pitchai-hm.vercel.app

> Auditoria feita por 3 agentes + revisão manual. Itens marcados com ☐ estão pendentes.

---

## 1. BACKEND (site)

### Endpoints existentes

| Rota                                                                                          | Auth                       | Função                                               |
| --------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| `/api/hot-products`                                                                           | Bearer Firebase + throttle | Produtos Quentes (escrita só para mestre autorizado) |
| `/api/account/ensure`                                                                         | Bearer Firebase            | Garante doc `users/{uid}`                            |
| `/api/account/sync-token`                                                                     | Bearer + assinatura        | Token da extensão                                    |
| `/api/admin/check`, `/api/admin/courtesy`                                                     | Admin                      | Cortesias/comped_access                              |
| `/api/checkout/start`                                                                         | Bearer + throttle IP/uid   | Checkout Stripe                                      |
| `/api/public/chat/reply`                                                                      | Sync token + quota         | IA do chat da live                                   |
| `/api/public/gemini/{generate,transcribe}`                                                    | Sync token                 | Gemini texto/áudio                                   |
| `/api/public/live/{config,mapping,session,verify}`                                            | Sync token                 | Sync da extensão                                     |
| `/api/public/payments/webhook`                                                                | HMAC Stripe                | Assinaturas + referrals                              |
| `/api/public/pitch/bank`, `/api/public/tts/speak`, `/api/script/generate`, `/api/tts/preview` | Sync token                 | Pitches, voz, roteiros                               |

### Pendências / riscos

- ☐ **Configurar `STRIPE_LIVE_WEBHOOK_SECRET`** — criar webhook Live na Stripe apontando para `/api/public/payments/webhook`. O deploy agora bloqueia qualquer configuração Stripe que não seja explicitamente live. **Prioridade máxima: pagamentos reais não confirmam sem esse segredo.**
- ☐ **Roll da sk_live** colada em texto puro no chat (Stripe → API keys → Roll).
- ☐ `checkout/start.ts:206-210` devolve `debug: getStripeErrorMessage(error)` ao cliente — vaza detalhe interno; remover em produção.
- ☐ Endpoints de IA sem zod (cast manual): `chat/reply`, `gemini/*`, `pitch/bank`, `tts/*`, `script/generate` — `gemini/generate` aceita prompt de 20KB.
- ☐ Sem `throttle()` anti-brute-force em: `admin/*`, `account/ensure`, `script/generate`, `tts/preview`, `gemini/*`, `pitch/bank`.
- ☐ `live/session.ts:157-170` — ações `start`/`event`/`end` sem try/catch (500 cru).
- ☐ `admin/guard.ts:52` vaza `error.message` no 500.
- ☐ Env vars de integrações ainda precisam ser conferidas no deploy; `MASTER_UIDS` e `MASTER_EMAILS` já estão documentadas no `.env.example`.
- ☐ CORS `cors.server.ts:20-22`: sem `origin` libera `*`; localhost HTTP aceito em produção.
- ☐ HMAC bypass quando header ausente (`api-auth.server.ts:92`) — garantir `PITCHAI_SKIP_HMAC` fora de produção.
- ☐ Conferir `MASTER_UIDS` e `MASTER_EMAILS` adicionais em Production e Preview.
- ☐ `apiVersion` Stripe pinada `2026-03-25.dahlia` — confirmar suporte do SDK.

---

## 2. FRONT / UX (site)

### Telas existentes

| Tela                                                                                                             | Status     |
| ---------------------------------------------------------------------------------------------------------------- | ---------- |
| Landing `/`                                                                                                      | ✅         |
| Login/Signup/Reset `/entrar`                                                                                     | ✅         |
| Dashboard `/app` — 10 seções (inicio, live, desempenho, produtos, quentes, ia, voz, proteção, automações, conta) | ✅         |
| Planos `/planos`, Comprar `/comprar`                                                                             | ✅         |
| Pós-checkout `/checkout/return`                                                                                  | ⚠️ parcial |
| Quentes, Indique, Lives, Download, Termos, Admin                                                                 | ✅         |

### Pendências / faltas

- ☐ **`checkout.return.tsx`** confia no `session_id` sem verificar status real da sessão; sem polling do webhook. Criar página de erro pós-checkout.
- ☐ **Cancelamento de assinatura**: `createPortalSession` (`billing.functions.ts:71-84`) existe no server mas **nunca é chamado no front** — sem botão "gerenciar assinatura" em Conta/Planos.
- ☐ **Recibo/fatura**: sem link para invoice nem histórico de pagamentos na UI.
- ☐ `/planos?checkout=cancelado` não tem handler (cancelamento silencioso).
- ☐ `StripeEmbeddedCheckout.tsx` órfão — fluxo real é redirect; unificar ou remover.
- ☐ Remover em Quentes sem confirmação (`QuentesSection.tsx:46-54`).
- ☐ Import de backup sobrescreve tudo sem confirmação (`ContaSection.tsx:24-42`).
- ☐ Contador de vendas: `pollSalesCount` falha silenciosa (`LiveDashboard/index.tsx:270-288`).
- ☐ Acessibilidade: botão ✏️ em `ProductsSection.tsx:264` sem aria-label; Trash2 em Quentes só com title; campos dependendo de placeholder (editor de produto, contexto IA).
- ☐ `app-grid--3` sem breakpoint dedicado em 900px (Quentes/Produtos).
- ☐ Páginas de marketing com cores fixas (`checkout.return.tsx` `text-[#00E676]`) quebram em light mode; dashboard força dark.
- ☐ **Duplicação de código**: `sections/ProdutosSection.tsx` (app-*) vs `ProductsSection.tsx` (shadcn) — duas telas de produtos com designs diferentes; unificar.
- ☐ Erros só via toast (sonner) em vários fluxos — sem estado de erro inline.

---

## 3. EXTENSÃO (v0.18.21)

### Implementado ✅

- Chat IA automático, voz/TTS com microfone virtual, fixar produto manual + auto-fixar (rodízio), proteção/violações (com flag `strong` + dedupe 10min), leitura de vitrine (DOM + rede), painel completo, barra de controle, sync token/licença, aviso de cota baixa, 53 testes (`npm test` em `extension/`).

### Pendências / riscos

- ☐ **DOM frágil**: seletores `data-tid`/`data-e2e`/classes do TikTok quebram com frequência; fallbacks heurísticos existem (`dom-map.js` score, `hasMultipleProductRows`) mas podem gerar falso positivo. Monitorar a cada mudança do TikTok.
- ☒ ~~Permissão `microphone` ausente no manifest~~ — **não existe** essa permissão no MV3 (gerava `Permission microphone is unknown.` no console). O mic é pedido em runtime via `getUserMedia` + `allow="microphone"` no iframe do painel. Removida do manifest em 2026-08-21.
- ☐ **Validar mídia virtual nativa da extensão** — confirmar câmera e microfone Pitch AI selecionados na página da live, sem instalação de programa externo.
- ☐ Erros silenciosos: `hook.js:183-185` e `hook.js:258-260` engolem falhas de parse/rede.
- ☐ Sem onboarding guiado no popup (`popup.html` só links).
- ☐ Auto-fixar não deixa claro que casa por **nome** na vitrine (`panel.js:554-572`).
- ☐ Sem background service worker (Manifest V3) — tudo no content script; ok por enquanto.
- ☐ Uma live por aba (singleton `chatState`) — multi-live quebraria.
- ☐ **Chrome Web Store**: sem pipeline de upload automatizado (zip é gerado pelo `build:extension`, upload manual); sem changelog.

---

## 4. Prioridades sugeridas (ordem)

1. **Webhook Stripe live** (`whsec_` de produção) — sem isso, assinaturas pagas não ativam.
2. **Roll da sk_live** exposta.
3. Remover `debug` do checkout 500.
4. Botão "gerenciar assinatura" (Stripe Portal) em Conta + página de erro pós-checkout.
5. ~~Permissão `microphone` no manifest da extensão~~ — inválida no MV3, removida em 2026-08-21 (ver seção 3).
6. Unificar telas de Produtos duplicadas.
7. zod + throttle nos endpoints de IA.
8. Onboarding da extensão + documentação da voz virtual.

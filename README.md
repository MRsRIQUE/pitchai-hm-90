# Pitch AI

Ferramenta para vendedores em live do TikTok Shop: respostas com IA no chat da live, auto-fixar produto, encerramento por tempo, proteção contra violações, TTS de voz e banco de pitches — com painel web, extensão do Chrome e cobrança por assinatura (Stripe) com programa de indicações (60% de comissão).

> Produção: [pitchai-hm.vercel.app](https://pitchai-hm.vercel.app)

## Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (React 19 + Vite + Nitro), com TanStack Router (file-based routes em `src/routes`) e server functions
- **UI**: Tailwind CSS v4 + componentes shadcn/ui (`src/components/ui`), Zustand para estado (`src/stores`), Motion
- **Backend**: Firebase Auth (email/senha) + Firestore acessado via REST pelo servidor (`src/lib/firebase.server.ts`), sem Admin SDK; regras em `firestore.rules`
- **Pagamentos**: Stripe (Checkout + webhooks com verificação de assinatura; comissões de afiliado idempotentes)
- **IA**: Google Gemini (`@google/genai`) — chat, transcrição e TTS — sempre proxyficado pelo backend (a chave nunca chega ao cliente). Modelos centralizados em `src/lib/live/ai-models.ts`
- **Extensão Chrome** (MV3) em `extension/`, empacotada por `scripts/pack-extension.mjs`
- **Testes**: Playwright (e2e em `e2e/`) e testes unitários da extensão em `extension/tests`

## Desenvolvimento

```bash
npm install
cp .env.example .env   # preencha as variáveis (Firebase server, Gemini, Stripe, E2E)
npm run dev            # http://localhost:3000
```

Scripts principais: `npm run build`, `npm run lint`, `npm run test:e2e`, `npm run test:smoke`, `npm run build:extension`.

## Segurança

- Firestore: default deny; escritas sensíveis (assinatura, uso, cotas) exclusivas do backend; ver `firestore.rules` e `security_spec.md`
- Endpoints de IA: autenticação por ID token Firebase ou sync token + HMAC (timestamp + nonce anti-replay), cotas diárias/mensais por plano (`src/lib/live/api-auth.server.ts`)
- Em dev, o HMAC pode ser desativado explicitamente com `PITCHAI_SKIP_HMAC=1` (nunca em produção)
- Webhook Stripe: assinatura verificada manualmente (HMAC-SHA256, tolerância de 5 min); somente chaves live são aceitas

## Estrutura

```
src/
  routes/        rotas (páginas + rotas de API em routes/api)
  components/    UI (live/, ui/)
  lib/           firebase, stripe, auth/cotas, planos, sync da extensão
  stores/        estado Zustand
extension/       extensão do Chrome (fonte)
e2e/             testes Playwright
scripts/         build/pack da extensão
```

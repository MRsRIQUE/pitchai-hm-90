# Firestore Security Spec — Pitch AI

## Coleções cobertas pelas regras (`firestore.rules`)

| Coleção | Leitura | Escrita |
| --- | --- | --- |
| `sync_tokens/{token}` | pública (`get`) | dono (campos `uid`/`createdAt` apenas) ou privilegiado |
| `live_configs_by_token/{token}` | pública (`get`) | dono (campos `uid`/`config`/`updatedAt`, `uid` imutável) ou privilegiado |
| `api_nonces/{nonce}` | servidor | servidor (`create` privilegiado — create-if-absent p/ anti-replay HMAC) |
| `users/{uid}` (+ `subscription`, `sessions`, `referral`, `referrals`, `usage`, `token_usage`) | dono ou privilegiado | subscription/usage/token_usage: somente servidor |
| `referral_claims`, `referral_commissions`, `comped_access`, `checkout_intents`, `payment_events` | restritas (dono/privilegiado/servidor) | servidor (claims: dono cria, `claimId == uid`) |
| `referral_codes/{code}` | pública (`get`) | dono cria (`uid` próprio); update/delete: servidor |
| `ranked_products`, `ai_usage_stats` | ver regras | privilegiado |
| `admins/{uid}` | próprio (`get`), lista p/ admin | servidor |
| `admin_plans`, `admin_settings` | privilegiado | privilegiado |

## Invariantes de dados

1. `ai_usage_stats`: um documento por usuário válido; bloqueio de conta IA via `status == "blocked"`; somente privilegiado escreve.
2. `usage` e `token_usage`: incrementos exclusivamente pelo backend (cotas não podem ser zeradas pelo cliente).
3. `subscription`: escrita apenas via webhook/servidor; o cliente nunca altera o próprio plano.
4. `api_nonces`: um documento por nonce HMAC; existência == replay. TTL recomendado no campo `expireAt` (console > Firestore > TTL policies).

## Payloads de segurança testados (dirty dozen)

1. Injeção de contagem de tokens negativa — bloqueado: `usage` é write-only-servidor.
2. Criação de estatísticas sem autenticação — bloqueado: default deny + escrita privilegiada.
3. String de modelo gigante (>200 chars) — irrelevante para Firestore (modelos centralizados no backend em `src/lib/live/ai-models.ts`).
4. Endpoint inválido — validado por zod nas rotas de API.
5. Sobrescrever uso de outro usuário — bloqueado: `isOwnerOf(uid)`.
6. Latência não numérica — registrado apenas pelo backend.
7. Status fora do enum — `planFromSub` aceita somente planos conhecidos (`findPitchaiPlan`).
8. Campo de email ausente — webhook exige `metadata.userId`.
9. UserID falsificado (path mismatch) — bloqueado: `request.auth.uid == uid`.
10. Listagem sem filtro — bloqueado: `list` restrito onde aplicável.
11. Limpar logs de uso sem privilégio — bloqueado: somente servidor.
12. Timestamp malformado — rejeitado: webhook verifica idade da assinatura (±300s); nonces expiram em 10 min.

## Regras de produção

As regras em `firestore.rules` seguem default deny, exigem autenticação para dados de usuário, validam campos escritos pelo cliente (`diff().affectedKeys().hasOnly(...)`) e reservam escritas sensíveis ao backend (`isServer()`).

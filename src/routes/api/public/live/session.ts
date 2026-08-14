import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { corsHeaders } from "@/lib/live/cors.server";
import { throttle } from "@/lib/live/rate-limit.server";
import { fsGet, fsSet } from "@/lib/firebase.server";
import { authorizeSyncToken } from "@/lib/live/api-auth.server";

const num = (max: number) => z.number().finite().min(0).max(max).optional();

const BodySchema = z.object({
  action: z.enum(["start", "end", "event"]),
  token: z.string().uuid(),
  session_id: z.string().uuid().optional(),
  kind: z.enum(["answered", "ignored", "blocked", "product", "tokens", "tts", "sale"]).optional(),
  sale: z.object({ text: z.string().max(200).optional() }).optional(),
  product: z
    .object({ id: z.string().max(120).optional(), name: z.string().max(200).optional() })
    .optional(),
  tokens_in: num(1_000_000),
  tokens_out: num(1_000_000),
  tts_seconds: num(86_400),
  estimated_cost_cents: num(100_000),
  sales_snapshot: z
    .array(z.object({ text: z.string().max(200).optional() }).passthrough())
    .max(200)
    .optional(),
  notes: z.string().max(2000).optional(),
});

export const Route = createFileRoute("/api/public/live/session")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),
      POST: async ({ request }) => {
        const CORS = {
          ...corsHeaders(request),
          "Content-Type": "application/json",
        };
        const j = (status: number, body: unknown) =>
          new Response(JSON.stringify(body), { status, headers: CORS });

        const raw = await request.json().catch(() => null);
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) return j(400, { error: "invalid_body" });
        const body = parsed.data;

        // Throttle por token — estes endpoints não passam pelo contador diário.
        const gate = throttle(`live_session:` + body.token, { limit: 300, windowMs: 60_000 });
        if (!gate.ok)
          return new Response(
            JSON.stringify({ error: "rate_limited", retryAfter: gate.retryAfter }),
            { status: 429, headers: { ...CORS, "Retry-After": String(gate.retryAfter) } },
          );

        const access = await authorizeSyncToken(body.token);
        if (!access.ok || !access.userId) {
          return j(access.status ?? 403, {
            error: access.status === 401 ? "invalid_token" : "payment_required",
            message: access.message,
            locked: true,
          });
        }
        const uid = access.userId;

        if (body.action === "start") {
          const sessionId = randomUUID();
          await fsSet(
            `users/${uid}/sessions/${sessionId}`,
            {
              user_id: uid,
              started_at: new Date().toISOString(),
              ended_at: null,
              messages_answered: 0,
              messages_ignored: 0,
              messages_blocked: 0,
              products_pitched: [],
              tokens_in: 0,
              tokens_out: 0,
              tts_seconds: 0,
              estimated_cost_cents: 0,
              sales_snapshot: [],
              notes: null,
            },
            { mode: "server" },
          );
          return j(200, { ok: true, session_id: sessionId });
        }

        if (!body.session_id) return j(400, { error: "missing_session_id" });

        // Confirma que a sessão pertence a este usuário
        const sess = await fsGet(`users/${uid}/sessions/${body.session_id}`, {
          mode: "server",
        });
        if (!sess) return j(401, { error: "invalid_session" });
        const data = sess.data as any;

        if (body.action === "end") {
          await fsSet(
            `users/${uid}/sessions/${body.session_id}`,
            {
              ...data,
              ended_at: new Date().toISOString(),
              sales_snapshot: body.sales_snapshot ?? data.sales_snapshot ?? [],
              notes: body.notes ?? data.notes ?? null,
            },
            { mode: "server" },
          );
          return j(200, { ok: true });
        }

        if (body.action === "event") {
          const patch: Record<string, unknown> = {};
          if (body.kind === "answered") patch.messages_answered = (data.messages_answered ?? 0) + 1;
          else if (body.kind === "ignored")
            patch.messages_ignored = (data.messages_ignored ?? 0) + 1;
          else if (body.kind === "blocked")
            patch.messages_blocked = (data.messages_blocked ?? 0) + 1;
          else if (body.kind === "product" && body.product?.name) {
            const list = Array.isArray(data.products_pitched) ? data.products_pitched : [];
            const exists = list.some((p: any) => p?.name === body.product?.name);
            patch.products_pitched = exists
              ? list
              : [
                  ...list,
                  {
                    name: body.product.name,
                    id: body.product.id ?? null,
                    at: new Date().toISOString(),
                  },
                ];
          } else if (body.kind === "tokens") {
            patch.tokens_in = (data.tokens_in ?? 0) + (body.tokens_in ?? 0);
            patch.tokens_out = (data.tokens_out ?? 0) + (body.tokens_out ?? 0);
            patch.estimated_cost_cents =
              (data.estimated_cost_cents ?? 0) + (body.estimated_cost_cents ?? 0);
          } else if (body.kind === "tts") {
            patch.tts_seconds = (data.tts_seconds ?? 0) + (body.tts_seconds ?? 0);
            patch.estimated_cost_cents =
              (data.estimated_cost_cents ?? 0) + (body.estimated_cost_cents ?? 0);
          } else if (body.kind === "sale") {
            const prev = Array.isArray(data.sales_snapshot) ? data.sales_snapshot : [];
            patch.sales_snapshot = [
              ...prev.slice(-199),
              { text: String(body.sale?.text ?? "").slice(0, 200), at: new Date().toISOString() },
            ];
          } else {
            return j(400, { error: "unknown_kind" });
          }
          await fsSet(
            `users/${uid}/sessions/${body.session_id}`,
            { ...data, ...patch },
            { mode: "server" },
          );
          return j(200, { ok: true });
        }

        return j(400, { error: "unknown_action" });
      },
    },
  },
});

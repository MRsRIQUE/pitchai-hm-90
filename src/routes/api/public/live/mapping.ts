import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsHeaders } from "@/lib/live/cors.server";
import { throttle } from "@/lib/live/rate-limit.server";
import { getLiveConfigByToken, setLiveConfigByToken } from "@/lib/firebase.server";
import { authorizeSyncToken } from "@/lib/live/api-auth.server";

const PayloadSchema = z.object({
  version: z.literal(1),
  host: z.string().min(1).max(200),
  exportedAt: z.number().optional(),
  targets: z.record(z.string(), z.unknown()).default({}),
  regions: z.record(z.string(), z.unknown()).default({}),
  status: z.record(z.string(), z.unknown()).optional(),
});

const BodySchema = z.object({
  action: z.enum(["pull", "push"]),
  token: z.string().uuid(),
  host: z.string().min(1).max(200).optional(),
  payload: PayloadSchema.optional(),
});

const MAX_BYTES = 256 * 1024;

export const Route = createFileRoute("/api/public/live/mapping")({
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
        const gate = throttle(`live_mapping:` + body.token, { limit: 60, windowMs: 60_000 });
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

        const remote = await getLiveConfigByToken(body.token);

        if (body.action === "pull") {
          const host = body.host ?? "shop.tiktok.com";
          const mappings = (remote?.config?.mappings ?? {}) as Record<string, any>;
          const entry = mappings[host] ?? null;
          return j(200, {
            ok: true,
            payload: entry?.payload ?? null,
            updatedAt: entry?.updatedAt ?? null,
          });
        }

        if (!body.payload) return j(400, { error: "invalid_payload" });
        if (JSON.stringify(body.payload).length > MAX_BYTES)
          return j(413, { error: "payload_too_large" });

        const mappings = (remote?.config?.mappings ?? {}) as Record<string, any>;
        mappings[body.payload.host] = {
          payload: JSON.parse(JSON.stringify(body.payload)),
          updatedAt: new Date().toISOString(),
        };
        try {
          await setLiveConfigByToken(
            body.token,
            { uid, config: { ...(remote?.config ?? {}), mappings } },
            { mode: "server" },
          );
        } catch (err) {
          console.error("[live/mapping] push falhou:", err);
          return j(500, { error: err instanceof Error ? err.message : "push_failed" });
        }
        return j(200, { ok: true });
      },
    },
  },
});

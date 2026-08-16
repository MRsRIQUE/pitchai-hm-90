import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsHeaders } from "@/lib/live/cors.server";
import { throttle } from "@/lib/live/rate-limit.server";
import { getLiveConfigByToken, setLiveConfigByToken } from "@/lib/firebase.server";
import { authorizeSyncToken } from "@/lib/live/api-auth.server";

const BodySchema = z.object({
  action: z.enum(["pull", "push"]),
  token: z.string().uuid(),
  config: z.record(z.string(), z.unknown()).optional(),
});
const MAX_CONFIG_BYTES = 256 * 1024;

export const Route = createFileRoute("/api/public/live/config")({
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
        const gate = throttle(`live_config:` + body.token, { limit: 120, windowMs: 60_000 });
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

        if (body.action === "pull") {
          const remote = await getLiveConfigByToken(body.token);
          return j(200, { ok: true, config: remote?.config ?? {} });
        }
        if (body.action === "push") {
          if (!body.config) return j(400, { error: "invalid_config" });
          if (JSON.stringify(body.config).length > MAX_CONFIG_BYTES)
            return j(413, { error: "config_too_large" });
          try {
            await setLiveConfigByToken(
              body.token,
              { uid, config: body.config },
              { mode: "server" },
            );
          } catch (err) {
            console.error("[live/config] push falhou:", err);
            return j(500, { error: "push_failed" });
          }
          return j(200, { ok: true });
        }
        return j(400, { error: "unknown_action" });
      },
    },
  },
});

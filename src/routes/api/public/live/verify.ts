import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsHeaders } from "@/lib/live/cors.server";
import { FirebaseServerCredentialsError } from "@/lib/firebase.server";
import { getSyncTokenStatus } from "@/lib/live/api-auth.server";
import { throttle } from "@/lib/live/rate-limit.server";

const BodySchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/api/public/live/verify")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),
      POST: async ({ request }) => {
        const CORS = {
          ...corsHeaders(request),
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        };
        const j = (status: number, body: unknown) =>
          new Response(JSON.stringify(body), { status, headers: CORS });

        const raw = await request.json().catch(() => ({}));
        const parsed = BodySchema.safeParse(raw);
        let token = parsed.success ? parsed.data.token : undefined;

        if (!token) {
          const auth = request.headers.get("authorization") || "";
          token = auth.replace(/^Bearer\s+/i, "").trim();
        }
        if (!token) {
          token = request.headers.get("x-pitchai-token") || "";
        }

        if (!token) {
          return j(401, {
            ok: false,
            valid: false,
            locked: true,
            reason: "missing_token",
            message: "Nenhum Sync Token fornecido.",
          });
        }

        // Throttle por token
        const gate = throttle(`live_verify:` + token, { limit: 120, windowMs: 60_000 });
        if (!gate.ok) {
          return j(429, { ok: false, error: "rate_limited", retryAfter: gate.retryAfter });
        }

        try {
          const status = await getSyncTokenStatus(token);
          return j(200, status);
        } catch (error) {
          // Configuração de servidor quebrada não pode responder 200 com
          // "Sem plano": isso mente para quem tem acesso e some do radar.
          if (error instanceof FirebaseServerCredentialsError) {
            console.error("[live/verify] credenciais de servidor ausentes:", error.message);
            return j(503, {
              ok: false,
              valid: false,
              locked: true,
              reason: "server_misconfigured",
              message:
                "Não foi possível verificar seu acesso agora. Isso é uma falha nossa, não do seu plano.",
            });
          }
          throw error;
        }
      },
    },
  },
});

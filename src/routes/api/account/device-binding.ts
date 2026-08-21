import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyFirebaseIdToken } from "@/lib/firebase.server";
import {
  formatReleaseMoment,
  loadDeviceBindingMode,
  nextReleaseAt,
  readDeviceBinding,
  readDeviceReleaseState,
  releaseDeviceBinding,
} from "@/lib/live/api-auth.server";

/**
 * Estado e desvínculo da instalação da extensão.
 *
 * GET  — o que o painel precisa mostrar antes de o vendedor decidir.
 * POST — desvincula, no máximo uma vez a cada 24 horas.
 *
 * Não exige assinatura ativa de propósito: desvincular não consome nada nem
 * libera recurso pago, e quem está com o pagamento em processamento não pode
 * ficar sem conseguir arrumar o próprio navegador.
 */

const BodySchema = z.object({
  action: z.literal("release"),
});

async function authenticate(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const user = await verifyFirebaseIdToken(token).catch(() => null);
  return user ? { user, token } : null;
}

const SESSAO_INVALIDA = "Sessão inválida. Entre novamente.";

export const Route = createFileRoute("/api/account/device-binding")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticate(request);
        if (!auth) return Response.json({ error: SESSAO_INVALIDA }, { status: 401 });

        try {
          const [binding, release, mode] = await Promise.all([
            readDeviceBinding(auth.user.uid, true),
            readDeviceReleaseState(auth.user.uid),
            loadDeviceBindingMode(),
          ]);
          const canReleaseAt = nextReleaseAt(release.lastReleaseAt);
          return Response.json({
            ok: true,
            bound: Boolean(binding),
            // Só o final do identificador: é o suficiente para o vendedor
            // reconhecer a instalação e não expõe o identificador inteiro.
            installShort: binding ? binding.installId.slice(-4) : null,
            boundAt: binding?.boundAt ?? null,
            lastSeenAt: binding?.lastSeenAt ?? null,
            canRelease: !canReleaseAt,
            canReleaseAt,
            canReleaseAtLabel: formatReleaseMoment(canReleaseAt),
            releaseCount: release.count,
            enforced: mode === "exigir",
          });
        } catch (error) {
          console.error("[account/device-binding] GET", error);
          return Response.json(
            {
              error:
                "Não foi possível consultar o navegador vinculado agora. Tente novamente em instantes.",
            },
            { status: 503 },
          );
        }
      },

      POST: async ({ request }) => {
        const auth = await authenticate(request);
        if (!auth) return Response.json({ error: SESSAO_INVALIDA }, { status: 401 });

        const raw = await request.json().catch(() => null);
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) return Response.json({ error: "Ação inválida." }, { status: 400 });

        const outcome = await releaseDeviceBinding(auth.user.uid, "painel");
        if (!outcome.ok) {
          return Response.json(
            {
              error: "release_rate_limited",
              message: outcome.message,
              canReleaseAt: outcome.canReleaseAt,
              canReleaseAtLabel: formatReleaseMoment(outcome.canReleaseAt),
            },
            { status: outcome.status },
          );
        }

        return Response.json({
          ok: true,
          released: outcome.released,
          message: outcome.message,
          canRelease: !outcome.canReleaseAt,
          canReleaseAt: outcome.canReleaseAt,
          canReleaseAtLabel: formatReleaseMoment(outcome.canReleaseAt),
        });
      },
    },
  },
});

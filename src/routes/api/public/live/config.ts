import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsHeaders } from "@/lib/live/cors.server";
import { throttle } from "@/lib/live/rate-limit.server";
import {
  getLiveConfigByToken,
  patchLiveConfigByToken,
  setLiveConfigByToken,
} from "@/lib/firebase.server";
import { authorizeSyncToken } from "@/lib/live/api-auth.server";
import {
  invalidSyncKeys,
  selectSyncFields,
  SYNC_SCHEMA_VERSION,
  SYNC_SECTIONS,
} from "@/lib/live/sync-contract";

const BodySchema = z.object({
  action: z.enum(["pull", "push", "patch"]),
  token: z.string().uuid(),
  config: z.record(z.string(), z.unknown()).optional(),
  sections: z.array(z.enum(SYNC_SECTIONS)).min(1).max(SYNC_SECTIONS.length).optional(),
  source: z.enum(["web", "extension", "unknown"]).optional(),
  requestId: z.string().min(8).max(100).optional(),
});
const MAX_CONFIG_BYTES = 256 * 1024;
const ProductContextSchema = z
  .object({
    hook: z.string().max(4_000),
    painDesire: z.string().max(4_000),
    benefits: z.string().max(4_000),
    objectionResponse: z.string().max(4_000),
    chatInteraction: z.string().max(4_000),
    cta: z.string().max(4_000),
  })
  .partial();
const ProductPatchSchema = z
  .object({
    id: z.string().min(1).max(200).optional(),
    name: z.string().min(1).max(500),
    price: z.string().max(200).optional(),
    description: z.string().max(10_000).optional(),
    aiKnowledge: z.string().max(10_000).optional(),
    aiSalesContext: ProductContextSchema.optional(),
  })
  .passthrough();
const ProductsPatchSchema = z.array(ProductPatchSchema).max(1_000);
const TextPatchSchema = z
  .object({
    aiContext: z.record(z.string(), z.string().max(20_000)).optional(),
    productAiSalesContexts: z.record(z.string(), ProductContextSchema).optional(),
    ultimoRoteiro: z.string().max(50_000).optional(),
    roteirosPorProduto: z.record(z.string(), z.string().max(50_000)).optional(),
  })
  .passthrough();

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
            // Aditivo: `error` segue igual para a extensão antiga. `reason` diz
            // o motivo preciso (hoje só "device_mismatch"), que sem isto sairia
            // rotulado como "payment_required" — uma mentira para quem pagou.
            reason: access.reason,
            message: access.message,
            locked: true,
          });
        }
        const uid = access.userId;

        if (body.action === "pull") {
          const remote = await getLiveConfigByToken(body.token);
          const sections = body.sections;
          const remoteConfig = remote?.config ?? {};
          // Sem `sections` mantém o contrato v1: extensões antigas recebem a
          // configuração completa. Clientes v2 pedem apenas o que consomem.
          const config = sections ? selectSyncFields(remoteConfig, sections) : remoteConfig;
          return j(200, {
            ok: true,
            config,
            meta: {
              schemaVersion: SYNC_SCHEMA_VERSION,
              revision: remote?.revision ?? 0,
              updatedAt: remote?.updatedAt ?? null,
              sectionUpdatedAt: remote?.sectionUpdatedAt ?? {},
              sections: sections ?? [...SYNC_SECTIONS],
            },
          });
        }
        if (body.action === "push" || body.action === "patch") {
          if (!body.config) return j(400, { error: "invalid_config" });
          const sections = body.sections ?? [...SYNC_SECTIONS];
          if (body.action === "patch") {
            const invalid = invalidSyncKeys(body.config, sections);
            if (invalid.length) return j(400, { error: "invalid_sync_fields", fields: invalid });
            if (
              sections.includes("products") &&
              Object.prototype.hasOwnProperty.call(body.config, "produtos") &&
              !ProductsPatchSchema.safeParse(body.config.produtos).success
            ) {
              return j(400, { error: "invalid_products" });
            }
            if (sections.includes("texts") && !TextPatchSchema.safeParse(body.config).success) {
              return j(400, { error: "invalid_texts" });
            }
          }
          if (JSON.stringify(body.config).length > MAX_CONFIG_BYTES)
            return j(413, { error: "config_too_large" });
          try {
            const now = new Date().toISOString();
            if (body.action === "patch") {
              const result = await patchLiveConfigByToken(
                body.token,
                {
                  uid,
                  fields: selectSyncFields(body.config, sections),
                  sections,
                  updatedAt: now,
                },
                { mode: "server" },
              );
              return j(200, {
                ok: true,
                success: true,
                revision: result.revision,
                updatedAt: result.updatedAt,
                sections,
                requestId: body.requestId,
              });
            }

            // Contrato v1: extensões antigas ainda substituem a configuração
            // completa. Clientes v2 usam o patch atômico acima.
            const remote = await getLiveConfigByToken(body.token);
            const revision = (remote?.revision ?? 0) + 1;
            const sectionUpdatedAt = Object.fromEntries(sections.map((section) => [section, now]));
            await setLiveConfigByToken(
              body.token,
              {
                uid,
                config: body.config,
                updatedAt: now,
                revision,
                sectionUpdatedAt,
              },
              { mode: "server" },
            );
            return j(200, {
              ok: true,
              success: true,
              revision,
              updatedAt: now,
              sections,
              requestId: body.requestId,
            });
          } catch (err) {
            console.error("[live/config] push falhou:", err);
            return j(500, { error: "push_failed" });
          }
        }
        return j(400, { error: "unknown_action" });
      },
    },
  },
});

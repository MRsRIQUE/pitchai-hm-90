import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsHeaders } from "@/lib/live/cors.server";
import { throttle } from "@/lib/live/rate-limit.server";
import { verifyFirebaseIdToken } from "@/lib/firebase.server";
import { addHotProduct, listHotProducts, removeHotProduct } from "@/lib/hot-products.server";

const ProductSchema = z.object({
  pid: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  price: z.string().max(40).optional(),
  priceCents: z.number().int().nonnegative().optional(),
  currency: z.string().max(8).optional(),
  imageUrl: z.string().max(1000).optional(),
  description: z.string().max(1000).optional(),
});

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    product: ProductSchema,
  }),
  z.object({
    action: z.literal("remove"),
    pid: z.string().min(1).max(64),
  }),
]);

/** UIDs com poder de escrita, lidos de MASTER_UIDS (string separada por vírgula). */
function masterUids(): Set<string> {
  const raw = (process.env.MASTER_UIDS || "").trim();
  return new Set(
    raw
      ? raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  );
}

async function authenticate(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const user = await verifyFirebaseIdToken(token).catch(() => null);
  return user ? { user, token } : null;
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function throttled(cors: Record<string, string>, gate: { ok: false; retryAfter: number }) {
  return new Response(JSON.stringify({ error: "rate_limited", retryAfter: gate.retryAfter }), {
    status: 429,
    headers: { ...cors, "Retry-After": String(gate.retryAfter) },
  });
}

export const Route = createFileRoute("/api/hot-products")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),
      GET: async ({ request }) => {
        const CORS = { ...corsHeaders(request), "Content-Type": "application/json" };

        const auth = await authenticate(request);
        if (!auth) return json(401, { error: "invalid_token" }, CORS);

        const gate = throttle(`hot_products:` + auth.user.uid, { limit: 60, windowMs: 60_000 });
        if (!gate.ok) return throttled(CORS, gate);

        try {
          const items = await listHotProducts();
          return json(200, { ok: true, isMaster: masterUids().has(auth.user.uid), items }, CORS);
        } catch (error) {
          console.error("[hot-products] GET falhou:", error);
          return json(500, { error: "internal" }, CORS);
        }
      },
      POST: async ({ request }) => {
        const CORS = { ...corsHeaders(request), "Content-Type": "application/json" };

        const auth = await authenticate(request);
        if (!auth) return json(401, { error: "invalid_token" }, CORS);

        const gate = throttle(`hot_products:` + auth.user.uid, { limit: 30, windowMs: 60_000 });
        if (!gate.ok) return throttled(CORS, gate);

        const raw = await request.json().catch(() => null);
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) return json(400, { error: "invalid_body" }, CORS);
        const body = parsed.data;

        if (!masterUids().has(auth.user.uid)) {
          return json(403, { error: "forbidden" }, CORS);
        }

        try {
          if (body.action === "add") {
            await addHotProduct(auth.user.uid, body.product);
          } else {
            await removeHotProduct(auth.user.uid, body.pid);
          }
          return json(200, { ok: true }, CORS);
        } catch (error) {
          console.error("[hot-products] POST falhou:", error);
          return json(500, { error: "internal" }, CORS);
        }
      },
    },
  },
});

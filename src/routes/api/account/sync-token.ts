import { createFileRoute } from "@tanstack/react-router";
import {
  fsDelete,
  fsGet,
  fsSet,
  getSyncTokenOwner,
  verifyFirebaseIdToken,
} from "@/lib/firebase.server";
import { resolveUserAccess } from "@/lib/live/access.server";
import { throttle } from "@/lib/live/rate-limit.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authenticate(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const user = await verifyFirebaseIdToken(token).catch(() => null);
  return user ? { user, token } : null;
}

async function createToken(
  uid: string,
  email: string | null,
  userToken: string,
  config: unknown = {},
) {
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  // Sequencial de propósito: a regra da config confirma que o token já pertence
  // ao usuário. Isso também elimina a dependência da conta técnica do backend.
  await fsSet(`sync_tokens/${token}`, { uid, createdAt: now }, { userToken });
  await fsSet(
    `live_configs_by_token/${token}`,
    {
      uid,
      config: config && typeof config === "object" ? (config as Record<string, unknown>) : {},
      updatedAt: now,
    },
    { userToken },
  );
  await fsSet(`users/${uid}`, { syncToken: token, email, updated_at: now }, { userToken });
  return token;
}

async function ensureToken(
  uid: string,
  email: string | null,
  userToken: string,
  regenerate = false,
) {
  const userDoc = await fsGet(`users/${uid}`, { userToken });
  const existingToken = String(userDoc?.data?.syncToken || "").trim();
  let oldConfig: unknown = {};

  if (UUID_RE.test(existingToken)) {
    const [owner, configDoc] = await Promise.all([
      getSyncTokenOwner(existingToken).catch(() => null),
      fsGet(`live_configs_by_token/${existingToken}`, { userToken }).catch(() => null),
    ]);
    const configOwner = String(configDoc?.data?.uid || "");
    // Nunca copia a configuração de um token que pertença a outra conta.
    // Se só o vínculo sync_tokens sumiu, ainda preserva a config cujo uid é o dono atual.
    if (owner === uid || (!owner && configOwner === uid)) {
      oldConfig = configDoc?.data?.config ?? {};
    }
    if (!regenerate && owner === uid) {
      if (!configDoc) {
        await fsSet(
          `live_configs_by_token/${existingToken}`,
          { uid, config: {}, updatedAt: new Date().toISOString() },
          { userToken },
        );
      }
      return { token: existingToken, repaired: false, config: oldConfig };
    }
  }

  const token = await createToken(uid, email, userToken, oldConfig);
  if (UUID_RE.test(existingToken)) {
    const owner = await getSyncTokenOwner(existingToken).catch(() => null);
    if (owner === uid) {
      await Promise.all([
        fsDelete(`sync_tokens/${existingToken}`, { userToken }).catch(() => undefined),
        fsDelete(`live_configs_by_token/${existingToken}`, { userToken }).catch(() => undefined),
      ]);
    }
  }
  return { token, repaired: Boolean(existingToken) && !regenerate, config: oldConfig };
}

async function handle(request: Request, regenerate: boolean) {
  const auth = await authenticate(request);
  if (!auth) return Response.json({ error: "Sessão inválida. Entre novamente." }, { status: 401 });

  const gate = throttle(`sync_token:${auth.user.uid}`, { limit: 20, windowMs: 60_000 });
  if (!gate.ok) {
    return Response.json(
      { error: "Muitas tentativas. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const access = await resolveUserAccess(auth.user.uid, { userToken: auth.token }).catch(
    () => null,
  );
  if (!access?.active) {
    return Response.json(
      {
        error:
          "Sua conta ainda não tem assinatura ou cortesia ativa. Se recebeu uma cortesia, atualize a página e tente novamente.",
        reason: "payment_required",
      },
      { status: 403 },
    );
  }

  try {
    const result = await ensureToken(auth.user.uid, auth.user.email, auth.token, regenerate);
    return Response.json({
      ok: true,
      sync_token: result.token,
      config: result.config,
      repaired: result.repaired,
      plan: access.plan,
      accessSource: access.source,
    });
  } catch (error) {
    console.error("[account/sync-token]", error);
    return Response.json(
      { error: "Não foi possível preparar a conexão da extensão. Tente novamente em instantes." },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/account/sync-token")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request, false),
      POST: async ({ request }) => handle(request, true),
    },
  },
});

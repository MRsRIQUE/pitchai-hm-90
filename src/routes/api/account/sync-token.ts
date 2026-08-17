import crypto from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import {
  createSyncToken,
  fsDelete,
  fsGet,
  fsSet,
  verifyFirebaseIdToken,
} from "@/lib/firebase.server";

export const Route = createFileRoute("/api/account/sync-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const idToken = (request.headers.get("authorization") || "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        if (!idToken) return Response.json({ error: "Não autenticado." }, { status: 401 });

        const user = await verifyFirebaseIdToken(idToken).catch(() => null);
        if (!user?.uid) return Response.json({ error: "Sessão inválida." }, { status: 401 });

        try {
          const userDoc = await fsGet(`users/${user.uid}`, { mode: "server", userToken: idToken });
          const oldToken = userDoc?.data?.syncToken as string | undefined;
          const oldConfig = oldToken
            ? ((
                await fsGet(`live_configs_by_token/${oldToken}`, {
                  mode: "server",
                  userToken: idToken,
                })
              )?.data?.config ?? {})
            : {};
          const requestedToken = crypto.randomUUID();
          await fsSet(
            `users/${user.uid}`,
            {
              email: user.email?.trim().toLowerCase() ?? null,
              syncToken: requestedToken,
              updated_at: new Date().toISOString(),
            },
            { mode: "server", userToken: idToken },
          );
          await createSyncToken(requestedToken, user.uid, { mode: "server", userToken: idToken });
          await fsSet(
            `live_configs_by_token/${requestedToken}`,
            { uid: user.uid, config: oldConfig, updatedAt: new Date().toISOString() },
            { mode: "server", userToken: idToken },
          );
          if (oldToken && oldToken !== requestedToken) {
            await Promise.all([
              fsDelete(`sync_tokens/${oldToken}`, { mode: "server", userToken: idToken }),
              fsDelete(`live_configs_by_token/${oldToken}`, { mode: "server", userToken: idToken }),
            ]);
          }
          return Response.json({ sync_token: requestedToken, config: oldConfig });
        } catch (error) {
          console.error("[account/sync-token]", error);
          return Response.json(
            { error: "Não foi possível gerar o Sync token. Tente novamente." },
            { status: 500 },
          );
        }
      },
    },
  },
});

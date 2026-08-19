import { createFileRoute } from "@tanstack/react-router";
import { fsQuery } from "@/lib/firebase.server";
import { adminApiError, requireAdminRequest } from "@/lib/admin/guard";
import { grantComped, revokeComped, validateGrantCompedInput } from "@/lib/admin/comped";
import { COURTESY_DEFAULT_PLAN } from "@/lib/live/plans";

export const Route = createFileRoute("/api/admin/courtesy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const admin = await requireAdminRequest(request);
          const docs = await fsQuery("comped_access", {
            limit: 200,
            mode: "server",
            userToken: admin.token,
          });
          const items = docs
            .map((doc) => ({
              userId: doc.id,
              email: String(doc.data.email || "(conta removida)"),
              plan: String(doc.data.plan || COURTESY_DEFAULT_PLAN),
              status: String(doc.data.status || "comped"),
              grantedUntil: (doc.data.grantedUntil as string | null) || null,
              note: (doc.data.note as string | null) || null,
            }))
            .filter((item) => item.status === "comped")
            .sort((a, b) => String(b.grantedUntil).localeCompare(String(a.grantedUntil)));
          return Response.json({ items });
        } catch (error) {
          return adminApiError(error, { logLabel: "admin/courtesy" });
        }
      },

      POST: async ({ request }) => {
        try {
          const admin = await requireAdminRequest(request);
          const body = await request.json().catch(() => ({}));
          const validated = validateGrantCompedInput(body);
          if (!validated.ok) {
            return Response.json({ error: validated.error }, { status: validated.status });
          }
          const result = await grantComped(validated.value, admin.uid, {
            mode: "server",
            userToken: admin.token,
          });
          if (!result.ok) {
            return Response.json({ error: result.error }, { status: result.status });
          }
          return Response.json({
            ok: true,
            userId: result.userId,
            plan: result.plan,
            grantedUntil: result.grantedUntil,
          });
        } catch (error) {
          return adminApiError(error, { logLabel: "admin/courtesy" });
        }
      },

      DELETE: async ({ request }) => {
        try {
          const admin = await requireAdminRequest(request);
          const body = await request.json().catch(() => ({}));
          const result = await revokeComped(String(body.userId || ""), admin.uid, {
            mode: "server",
            userToken: admin.token,
          });
          if (!result.ok) {
            return Response.json({ error: result.error }, { status: result.status });
          }
          return Response.json({ ok: true });
        } catch (error) {
          return adminApiError(error, { logLabel: "admin/courtesy" });
        }
      },
    },
  },
});

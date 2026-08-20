import { createFileRoute } from "@tanstack/react-router";
import { adminApiError, requireAdminRequest } from "@/lib/admin/guard";
import { throttle } from "@/lib/live/rate-limit.server";

export const Route = createFileRoute("/api/admin/check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const admin = await requireAdminRequest(request);
          const gate = throttle(`admin_check:${admin.uid}`, { limit: 60, windowMs: 60_000 });
          if (!gate.ok) {
            return Response.json(
              { error: "Muitas consultas. Aguarde um instante." },
              { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
            );
          }
          return Response.json({ ok: true });
        } catch (error) {
          return adminApiError(error, { includeOk: true, logLabel: "admin/check" });
        }
      },
    },
  },
});

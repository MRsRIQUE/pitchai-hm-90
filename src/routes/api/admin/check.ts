import { createFileRoute } from "@tanstack/react-router";
import { adminApiError, requireAdminRequest } from "@/lib/admin/guard";

export const Route = createFileRoute("/api/admin/check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdminRequest(request);
          return Response.json({ ok: true });
        } catch (error) {
          return adminApiError(error, { includeOk: true, logLabel: "admin/check" });
        }
      },
    },
  },
});

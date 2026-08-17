import { createFileRoute } from "@tanstack/react-router";
import { isAdmin } from "@/lib/firebase.server";
import { verifyFirebaseIdToken } from "@/lib/firebase.server";

export const Route = createFileRoute("/api/admin/check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = (request.headers.get("authorization") || "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        if (!token) return Response.json({ admin: false }, { status: 401 });

        try {
          const user = await verifyFirebaseIdToken(token);
          const admin = await isAdmin(user.uid, user.email);
          return Response.json({ admin });
        } catch (error) {
          console.error("[admin/check]", error);
          return Response.json({ admin: false }, { status: 401 });
        }
      },
    },
  },
});

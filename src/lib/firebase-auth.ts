"use server";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { verifyFirebaseIdToken } from "@/lib/firebase.server";

export type FirebaseAuthContext = {
  userId: string;
  user: Awaited<ReturnType<typeof verifyFirebaseIdToken>>;
  firebaseToken: string;
};

function extractToken(request: Request): string | null {
  const authHeader = request?.headers?.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "").trim();
  }
  return null;
}

export const requireFirebaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    let token = extractToken(request);

    if (!token) {
      const cloned = request.clone();
      const body = await cloned.text().catch(() => "");
      const match = body.match(/"idToken"\s*:\s*"([^"]+)"/);
      if (match?.[1]) token = match[1];
    }

    if (!token) {
      console.error(
        "[requireFirebaseAuth] Token não encontrado. Headers:",
        Object.fromEntries(request.headers.entries()),
      );
      throw new Response("Unauthorized: No authorization header provided", { status: 401 });
    }

    let user: Awaited<ReturnType<typeof verifyFirebaseIdToken>>;
    try {
      user = await verifyFirebaseIdToken(token);
    } catch {
      throw new Response("Unauthorized: Invalid or expired token", { status: 401 });
    }
    return next({
      context: {
        userId: user.uid,
        user,
        firebaseToken: token,
      },
    });
  },
);

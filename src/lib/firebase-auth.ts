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
      throw new Error("Unauthorized: No authorization header provided");
    }

    const user = await verifyFirebaseIdToken(token);
    return next({
      context: {
        userId: user.uid,
        user,
        firebaseToken: token,
      },
    });
  },
);

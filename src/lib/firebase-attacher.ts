"use server";
import { createMiddleware } from "@tanstack/react-start";

// Cliente: anexa o ID token do Firebase a cada serverFn RPC.
export const attachFirebaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token: string | null = null;
    try {
      const { getFirebaseAuth } = await import("@/lib/firebase");
      const user = getFirebaseAuth().currentUser;
      if (user) token = await user.getIdToken();
    } catch {
      token = null;
    }
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);

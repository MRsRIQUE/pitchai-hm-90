"use server";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { verifyFirebaseIdToken } from "@/lib/firebase.server";

// Servidor: exige um ID token Firebase válido no header Authorization.
export const requireFirebaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized: No authorization header provided");
    }
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      throw new Error("Unauthorized: No token provided");
    }
    const user = await verifyFirebaseIdToken(token);
    return next({
      context: {
        userId: user.uid,
        user,
      },
    });
  },
);

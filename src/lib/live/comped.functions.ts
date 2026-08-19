import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth, type FirebaseAuthContext } from "@/lib/firebase-auth";
import { fsQuery, isAdmin } from "@/lib/firebase.server";
import { AdminError } from "@/lib/admin/errors";
import {
  grantComped,
  revokeComped,
  validateCompedUserId,
  validateGrantCompedInput,
  type GrantCompedValue,
} from "@/lib/admin/comped";

export type CompedAccess = {
  userId: string;
  email: string;
  plan: string;
  status: string;
  grantedUntil: string | null;
  note: string | null;
};

async function assertAdmin(ctx: FirebaseAuthContext): Promise<void> {
  let admin = false;
  try {
    admin = await isAdmin(ctx.userId, ctx.user?.email, {
      mode: "server",
      userToken: ctx.firebaseToken,
    });
  } catch {
    admin = false;
  }
  if (!admin) throw new AdminError(403, "Forbidden");
}

function adminFirestoreOptions(ctx: FirebaseAuthContext) {
  return { mode: "server" as const, userToken: ctx.firebaseToken };
}

/* Lista os acessos de cortesia concedidos por administradores. */
export const listCompedAccess = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<CompedAccess[]> => {
    await assertAdmin(context);
    const firestore = adminFirestoreOptions(context);
    const docs = await fsQuery("comped_access", {
      orderBy: { field: "grantedUntil", direction: "DESCENDING" },
      limit: 200,
      ...firestore,
    });
    return docs.map((d) => ({
      userId: d.id,
      email: (d.data.email as string) ?? "(conta removida)",
      plan: (d.data.plan as string) ?? "pro",
      status: (d.data.status as string) ?? "comped",
      grantedUntil: (d.data.grantedUntil as string) ?? null,
      note: (d.data.note as string) ?? null,
    }));
  });

/* Concede acesso gratuito a um e-mail existente, por N dias.
 * Regras unificadas com /api/admin/courtesy (plans.ts é a fonte única). */
export const grantCompedAccess = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator(
    (data: {
      email?: unknown;
      days?: unknown;
      note?: unknown;
      plan?: unknown;
    }): GrantCompedValue => {
      const validated = validateGrantCompedInput(data ?? {});
      if (!validated.ok) throw new Error(validated.error);
      return validated.value;
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    try {
      await assertAdmin(context);
      const result = await grantComped(data, context.userId, adminFirestoreOptions(context));
      if (!result.ok) return { error: result.error };
      return { ok: true };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error ?? "erro desconhecido");
      console.error("[v0] Falha ao liberar cortesia", { email: data.email, detail });
      return {
        error: `Não foi possível liberar a cortesia: ${detail}`,
      };
    }
  });

/* Revoga o acesso de cortesia de uma conta. */
export const revokeCompedAccess = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { userId: string }): { userId: string } => {
    const check = validateCompedUserId(data?.userId);
    if (!check.ok) throw new Error(check.error);
    return { userId: check.userId };
  })
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    await assertAdmin(context);
    try {
      const result = await revokeComped(
        data.userId,
        context.userId,
        adminFirestoreOptions(context),
      );
      if (!result.ok) return { error: result.error };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "revoke_failed" };
    }
    return { ok: true };
  });

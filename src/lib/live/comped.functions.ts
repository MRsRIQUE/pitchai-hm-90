import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase-auth";
import { getUserByEmail, isAdmin, fsQuery, fsSet, setSubscription } from "@/lib/firebase.server";

export type CompedAccess = {
  userId: string;
  email: string;
  plan: string;
  status: string;
  grantedUntil: string | null;
  note: string | null;
};

async function assertAdmin(ctx: { userId: string; user?: { email?: string | null } }) {
  if (!(await isAdmin(ctx.userId, ctx.user?.email))) throw new Error("Forbidden");
}

/* Lista os acessos de cortesia concedidos por administradores. */
export const listCompedAccess = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<CompedAccess[]> => {
    await assertAdmin(context);
    const docs = await fsQuery("comped_access", {
      orderBy: { field: "grantedUntil", direction: "DESCENDING" },
      limit: 200,
      mode: "server",
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

/* Concede acesso gratuito a um e-mail existente, por N dias. */
export const grantCompedAccess = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { email: string; days: number; note?: string }) => {
    const email = String(data.email ?? "")
      .trim()
      .toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido");
    const days = Number(data.days);
    if (!Number.isFinite(days) || days < 1 || days > 3650) throw new Error("Período inválido");
    return { email, days, note: String(data.note ?? "").slice(0, 300) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    try {
      await assertAdmin(context);

      const user = await getUserByEmail(data.email, { mode: "server" });
      if (!user) return { error: "Nenhuma conta encontrada com esse e-mail" };

      const uid = user.id;
      const until = new Date(Date.now() + data.days * 86400000).toISOString();
      const now = new Date().toISOString();
      await setSubscription(
        uid,
        {
          plan: "pro",
          status: "comped",
          granted_until: until,
          current_period_end: until,
          updated_at: now,
        },
        { mode: "server" },
      );
      await fsSet(
        `comped_access/${uid}`,
        {
          email: data.email,
          plan: "pro",
          status: "comped",
          grantedUntil: until,
          note: data.note || null,
          grantedBy: context.userId,
        },
        { mode: "server" },
      );
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
  .validator((data: { userId: string }) => {
    const userId = String(data.userId ?? "").trim();
    // Firebase Auth UIDs não são necessariamente UUIDs.
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(userId)) throw new Error("Conta inválida");
    return { userId };
  })
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    await assertAdmin(context);
    try {
      await setSubscription(
        data.userId,
        {
          plan: "free",
          status: "free",
          granted_until: null,
          current_period_end: null,
          updated_at: new Date().toISOString(),
        },
        { mode: "server" },
      );
      await fsSet(
        `comped_access/${data.userId}`,
        {
          email: "",
          plan: "free",
          status: "free",
          grantedUntil: null,
          note: "revoked",
          grantedBy: context.userId,
        },
        { mode: "server" },
      );
    } catch (err) {
      return { error: err instanceof Error ? err.message : "revoke_failed" };
    }
    return { ok: true };
  });

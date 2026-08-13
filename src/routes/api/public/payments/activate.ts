import { createFileRoute } from "@tanstack/react-router";
import { getUserByEmail, setSubscription, verifyFirebaseIdToken } from "@/lib/firebase.server";

/**
 * Ativa a assinatura Pro de um usuário após compra em plataforma externa
 * (PerfectPay/Hotmart/Kiwify). Segurança:
 *  - Exige ALWAYS Authorization: Bearer <Firebase idToken> válido.
 *  - O email do payload deve corresponder ao usuário autenticado (ou o usuário
 *    autenticado deve ser admin).
 *  - licenseKey deve seguir formato PITCHAI-XXXX-XXXX-XXXX (não length>=6).
 */
const LICENSE_KEY_RE = /^PITCHAI-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export const Route = createFileRoute("/api/public/payments/activate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") || "";
          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          if (!token) {
            return Response.json(
              {
                success: false,
                message:
                  "Autenticação necessária. Faça login no Pitch AI antes de ativar sua licença.",
              },
              { status: 401 },
            );
          }

          let callerUid: string;
          let callerEmail: string | null;
          try {
            const verified = await verifyFirebaseIdToken(token);
            callerUid = verified.uid;
            callerEmail = verified.email ?? null;
          } catch {
            return Response.json(
              { success: false, message: "Sessão inválida. Faça login novamente." },
              { status: 401 },
            );
          }

          const body = await request.json();
          const email = (body.email || "").toString().toLowerCase().trim();
          const licenseKey = (body.licenseKey || "").toString().toUpperCase().trim();

          if (!email) {
            return Response.json(
              { success: false, message: "E-mail de compra é obrigatório." },
              { status: 400 },
            );
          }

          if (!LICENSE_KEY_RE.test(licenseKey)) {
            return Response.json(
              {
                success: false,
                message: "Chave de licença inválida. Formato esperado: PITCHAI-XXXX-XXXX-XXXX.",
              },
              { status: 400 },
            );
          }

          // O email do payload deve corresponder ao do caller autenticado.
          // Caso contrário, só permitimos se o caller for admin (TODO).
          if (callerEmail && callerEmail.toLowerCase() !== email) {
            return Response.json(
              {
                success: false,
                message:
                  "O e-mail de compra não corresponde ao da sessão atual. Use o mesmo e-mail do pagamento.",
              },
              { status: 403 },
            );
          }

          // Busca o documento do usuário no Firestore para obter o uid oficial.
          const userDoc = await getUserByEmail(email, { mode: "server" });
          const uid = userDoc?.id ?? callerUid;
          if (!userDoc) {
            return Response.json(
              {
                success: false,
                message:
                  "Nenhuma conta encontrada com este e-mail. Crie uma conta no Pitch AI usando o mesmo e-mail do pagamento.",
              },
              { status: 404 },
            );
          }

          const periodEnd = new Date();
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);

          try {
            await setSubscription(
              uid,
              {
                plan: "pitchai_pro",
                status: "active",
                current_period_end: periodEnd.toISOString(),
                granted_until: periodEnd.toISOString(),
                updated_at: new Date().toISOString(),
              },
              { mode: "server" },
            );
          } catch (err) {
            console.error("[payments-activate] Error updating subscription:", err);
            return Response.json(
              { success: false, message: "Erro ao ativar assinatura no banco de dados." },
              { status: 500 },
            );
          }

          return Response.json({
            success: true,
            message: "Assinatura ativada com sucesso! Bem-vindo ao Pitch AI.",
            userId: uid,
            plan: "pitchai_pro",
          });
        } catch (err) {
          console.error("[payments-activate] Exception:", err);
          return Response.json(
            { success: false, message: "Falha ao processar ativação de pagamento." },
            { status: 500 },
          );
        }
      },
    },
  },
});

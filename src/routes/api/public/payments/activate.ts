import { createFileRoute } from "@tanstack/react-router";
import {
  deletePendingPayment,
  getPendingPayment,
  setSubscription,
  verifyFirebaseIdToken,
} from "@/lib/firebase.server";
import { PITCHAI_PLANS } from "@/lib/live/plans";

/**
 * Ativa a assinatura Pro de um usuário após compra em plataforma externa
 * (PerfectPay/Hotmart/Kiwify).
 *
 * Segurança (importante): a ativação NUNCA confia em texto livre enviado pelo
 * cliente (ex.: uma "chave de licença"). Ela só acontece se existir um
 * pagamento aprovado real, registrado pelo webhook em `pending_payments`, com
 * o mesmo e-mail informado. Sem isso, a resposta é sempre negativa.
 *  - Exige ALWAYS Authorization: Bearer <Firebase idToken> válido.
 *  - O email do payload deve corresponder ao usuário autenticado.
 */
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
          let callerEmail: string;
          try {
            const verified = await verifyFirebaseIdToken(token);
            if (!verified.email) {
              return Response.json(
                {
                  success: false,
                  message: "Sua conta precisa ter um e-mail para ativar o pagamento.",
                },
                { status: 403 },
              );
            }
            callerUid = verified.uid;
            callerEmail = verified.email.toLowerCase().trim();
          } catch {
            return Response.json(
              { success: false, message: "Sessão inválida. Faça login novamente." },
              { status: 401 },
            );
          }

          const body = await request.json().catch(() => ({}));
          const email = (body.email || callerEmail).toString().toLowerCase().trim();

          if (!email) {
            return Response.json(
              { success: false, message: "E-mail de compra é obrigatório." },
              { status: 400 },
            );
          }

          // O email do payload deve corresponder ao do caller autenticado.
          if (callerEmail !== email) {
            return Response.json(
              {
                success: false,
                message:
                  "O e-mail de compra não corresponde ao da sessão atual. Use o mesmo e-mail do pagamento.",
              },
              { status: 403 },
            );
          }

          // Única fonte de verdade: um pagamento aprovado real registrado pelo
          // webhook. Nunca ativamos com base em algo digitado pelo usuário.
          const pending = await getPendingPayment(email, { mode: "server" });
          if (!pending || pending.data?.consumed === true) {
            return Response.json(
              {
                success: false,
                message:
                  "Ainda não encontramos um pagamento aprovado para este e-mail. Se você acabou de pagar, aguarde alguns minutos e tente novamente.",
              },
              { status: 404 },
            );
          }

          const pendingPlan = PITCHAI_PLANS.find((plan) => plan.priceId === pending.data?.plan);
          const planId = pendingPlan?.priceId || "pitchai_anual";
          const months = pendingPlan?.months || Number(pending.data?.months) || 12;
          const periodEnd = new Date();
          periodEnd.setUTCMonth(periodEnd.getUTCMonth() + months);

          try {
            await setSubscription(
              callerUid,
              {
                plan: planId,
                status: "active",
                current_period_end: periodEnd.toISOString(),
                granted_until: periodEnd.toISOString(),
                provider: "perfectpay",
                provider_sale_code: (pending.data?.saleCode as string | null) || null,
                updated_at: new Date().toISOString(),
              },
              { mode: "server" },
            );
            await deletePendingPayment(email, { mode: "server" });
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
            userId: callerUid,
            plan: planId,
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

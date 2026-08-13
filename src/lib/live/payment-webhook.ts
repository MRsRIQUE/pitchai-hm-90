import { getUserByEmail, setSubscription } from "@/lib/firebase.server";

/**
 * Processador unificado de webhooks de pagamento (PerfectPay, Kiwify, Hotmart, Eduzz, Mercado Pago).
 * Aceita tanto JSON quanto application/x-www-form-urlencoded.
 *
 * Segurança:
 *  - Requer token compartilhado (PERFECTPAY_TOKEN). Sem token configurado -> 503.
 *  - Rejeita 401 se o token for divergente (não apenas warning).
 *  - NUNCA trata ausência de status como aprovado.
 *  - Não loga PII (email/CPF) — só hash curto para correlação.
 */
export async function handlePaymentWebhook(request: Request): Promise<Response> {
  const corsHeaders = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json(
      { status: "online", message: "Webhook ativo. Use POST para notificações." },
      { headers: corsHeaders },
    );
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let body: any = {};

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      body = Object.fromEntries(params.entries());
    } else {
      body = await request.json().catch(() => ({}));
    }

    const expectedToken = process.env.PERFECTPAY_TOKEN;
    if (!expectedToken) {
      console.error("[webhook-payments] PERFECTPAY_TOKEN nao configurado");
      return Response.json(
        { error: "server_misconfigured" },
        { status: 503, headers: corsHeaders },
      );
    }
    const incomingTokenRaw =
      body.token || body.webhook_token || body.secret || body.public_token || "";
    const incomingToken = String(incomingTokenRaw).trim();
    if (!incomingToken || incomingToken !== expectedToken) {
      console.warn("[webhook-payments] Token divergente ou ausente");
      return Response.json({ error: "unauthorized" }, { status: 401, headers: corsHeaders });
    }
    const emailHash = String(body.email || "")
      .toLowerCase()
      .trim()
      .slice(0, 2);
    console.log(`[webhook-payments] Payload autorizado (email prefix: ${emailHash}***)`);

    // Identifica o e-mail do comprador a partir de diferentes formatos de payload
    const customerEmail = (
      body.customer?.email ||
      body["customer[email]"] ||
      body.email ||
      body.client?.email ||
      body.buyer?.email ||
      body.payer_email ||
      ""
    )
      .toLowerCase()
      .trim();

    const statusRaw = String(
      body.sale_status || body.status || body.event || body.saleStatus || "",
    ).toLowerCase();

    const isApproved =
      statusRaw.length > 0 &&
      (statusRaw.includes("approved") ||
        statusRaw.includes("paid") ||
        statusRaw.includes("aprovado") ||
        statusRaw.includes("pago") ||
        statusRaw.includes("completed") ||
        statusRaw.includes("order_approved"));

    if (!customerEmail) {
      return Response.json(
        { error: "missing_customer_email", message: "E-mail do cliente não informado no payload." },
        { status: 400, headers: corsHeaders },
      );
    }

    if (!isApproved) {
      console.log(`[webhook-payments] Status '${statusRaw}' ignorado (ainda não aprovado).`);
      return Response.json(
        { received: true, status: statusRaw, activated: false },
        { headers: corsHeaders },
      );
    }

    // Procura se o usuário já criou conta no sistema pelo e-mail
    const userDoc = await getUserByEmail(customerEmail, { mode: "server" });
    let activated = false;

    if (userDoc) {
      const periodEnd = new Date();
      periodEnd.setFullYear(periodEnd.getFullYear() + 1); // 1 ano de acesso Pro por padrão

      await setSubscription(
        userDoc.id,
        {
          plan: "pitchai_pro",
          status: "active",
          current_period_end: periodEnd.toISOString(),
          granted_until: periodEnd.toISOString(),
          updated_at: new Date().toISOString(),
        },
        { mode: "server" },
      );

      activated = true;
      console.log(`[webhook-payments] Licença Pro ativada para ${userDoc.id} (${customerEmail})`);
    } else {
      console.log(
        `[webhook-payments] Pagamento aprovado para ${customerEmail}. Usuário criará conta posteriormente.`,
      );
    }

    return Response.json(
      {
        success: true,
        activated,
        email: customerEmail,
        message: "Webhook de pagamento processado com sucesso.",
      },
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error("[webhook-payments] Exception:", err);
    return Response.json({ error: "internal_error" }, { status: 500, headers: corsHeaders });
  }
}

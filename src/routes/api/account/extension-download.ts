import { createFileRoute } from "@tanstack/react-router";
import { verifyFirebaseIdToken } from "@/lib/firebase.server";
import { resolveUserAccess } from "@/lib/live/access.server";
import { getExtensionPackage } from "@/lib/live/extension-package.server";
import { throttle } from "@/lib/live/rate-limit.server";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

export async function handleExtensionDownload(request: Request): Promise<Response> {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return Response.json(
      { error: "Entre na sua conta para baixar a extensão." },
      { status: 401, headers: PRIVATE_HEADERS },
    );
  }

  const user = await verifyFirebaseIdToken(token).catch(() => null);
  if (!user) {
    return Response.json(
      { error: "Sua sessão expirou. Entre novamente para continuar." },
      { status: 401, headers: PRIVATE_HEADERS },
    );
  }

  const gate = throttle(`extension_download:${user.uid}`, { limit: 10, windowMs: 60_000 });
  if (!gate.ok) {
    return Response.json(
      { error: "Muitas tentativas de download. Aguarde um instante." },
      {
        status: 429,
        headers: { ...PRIVATE_HEADERS, "Retry-After": String(gate.retryAfter) },
      },
    );
  }

  let access: Awaited<ReturnType<typeof resolveUserAccess>>;
  try {
    access = await resolveUserAccess(user.uid, { userToken: token });
  } catch (error) {
    console.error("[account/extension-download] Falha ao validar licença:", error);
    return Response.json(
      { error: "Não foi possível validar sua licença agora. Tente novamente em instantes." },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }

  if (!access.active) {
    return Response.json(
      { error: "É necessário ter uma licença ativa para baixar a extensão." },
      { status: 403, headers: PRIVATE_HEADERS },
    );
  }

  try {
    const zip = await getExtensionPackage();
    const body = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
    return new Response(body, {
      status: 200,
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="pitchai-extension.zip"',
        "Content-Length": String(zip.byteLength),
      },
    });
  } catch (error) {
    console.error("[account/extension-download] Pacote indisponível:", error);
    return Response.json(
      { error: "O arquivo da extensão está indisponível. Tente novamente em instantes." },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }
}

export const Route = createFileRoute("/api/account/extension-download")({
  server: {
    handlers: {
      GET: ({ request }) => handleExtensionDownload(request),
    },
  },
});

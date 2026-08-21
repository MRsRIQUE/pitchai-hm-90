// Origens permitidas nos endpoints públicos usados pela extensão.
// Antes era "*", o que permitia qualquer site chamar a API com um token vazado.
const ALLOWED_PATTERNS: RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)*tiktok\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)*tiktokglobalshop\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)*byteoversea\.com$/i,
  /^chrome-extension:\/\/[a-p]{32}$/i,
  /^http:\/\/localhost(:\d+)?$/i,
];

export function corsHeaders(request: Request, methods = "POST, OPTIONS") {
  const origin = request.headers.get("origin") || "";
  const allowed = ALLOWED_PATTERNS.some((rx) => rx.test(origin));
  return {
    // Sem origin (extensão em background / fetch server-to-server) → libera,
    // porque nesse caso não existe risco de CSRF via navegador.
    "Access-Control-Allow-Origin": allowed ? origin : origin ? "null" : "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-PitchAI-Signature, X-PitchAI-Timestamp, X-PitchAI-Nonce, X-PitchAI-Token, X-PitchAI-Install",
    Vary: "Origin",
  };
}

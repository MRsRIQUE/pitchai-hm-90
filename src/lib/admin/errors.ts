/**
 * Erro tipado com status HTTP para o fluxo de admin.
 * Quem mapeia para HTTP (rotas /api/admin/*) usa `status`; quem entrega
 * `{ error: message }` usa apenas `message`.
 */
export class AdminError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "AdminError";
    this.status = status;
  }
}

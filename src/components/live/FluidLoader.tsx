import "@/styles/fluid-loader.css";

/**
 * Overlay de tela cheia com "líquido" roxo subindo, usado durante
 * autenticação e criação de conta. Puramente decorativo e acessível
 * (role="status" + aria-busy) — não bloqueia nenhuma lógica.
 */
export function FluidLoader({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="fluid-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="fluid-loader__wave fluid-loader__wave--1" aria-hidden="true" />
      <div className="fluid-loader__wave fluid-loader__wave--2" aria-hidden="true" />
      <div className="fluid-loader__wave fluid-loader__wave--3" aria-hidden="true" />
      <div className="fluid-loader__wave fluid-loader__wave--4" aria-hidden="true" />
      <div className="fluid-loader__glow" aria-hidden="true" />

      <div className="fluid-loader__label">
        <div className="fluid-loader__spinner" aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  );
}

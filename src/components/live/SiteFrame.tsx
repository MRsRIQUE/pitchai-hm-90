/**
 * SiteFrame — moldura fixa ao redor da viewport.
 *
 * Estrutura extraída do template Circular (rbp-saas-template): não é um
 * `border`, são 4 barras fixas + 4 SVGs de canto côncavo, o que arredonda a
 * "janela" sem cortar o conteúdo. A cor sai dos tokens da landing
 * (`--frame`), então ela acompanha o modo claro/escuro em vez do preto fixo
 * do original. Some abaixo de 850px, como no template.
 *
 * As classes `.site-frame` / `.site-corner` vivem em `styles/landing.css`.
 */

/** canto côncavo 50x50 do template, rotacionado nos quatro cantos */
const CORNER_PATH = "M5.50871e-06 0C-0.00788227 37.3001 8.99616 50.0116 50 50H5.50871e-06V0Z";

const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

export function SiteFrame({
  thickness = 10,
  radius = 50,
}: {
  /** espessura das barras, em px */
  thickness?: number;
  /** tamanho dos SVGs de canto, em px */
  radius?: number;
}) {
  return (
    <div
      style={
        {
          "--frame-thickness": `${thickness}px`,
          "--frame-radius": `${radius}px`,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <div className="site-frame site-frame--top" />
      <div className="site-frame site-frame--bottom" />
      <div className="site-frame site-frame--left" />
      <div className="site-frame site-frame--right" />

      {CORNERS.map((pos) => (
        <svg
          key={pos}
          className={`site-corner site-corner--${pos}`}
          width={radius}
          height={radius}
          viewBox="0 0 50 50"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d={CORNER_PATH} fill="currentColor" />
        </svg>
      ))}
    </div>
  );
}

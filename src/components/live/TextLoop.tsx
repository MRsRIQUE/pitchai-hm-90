import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import "@/styles/text-loop.css";

/**
 * TextLoop — frase correndo por uma curva SVG (React Bits).
 *
 * O original usa GSAP só para um tween linear infinito; aqui o loop é um
 * `requestAnimationFrame` com delta de tempo, o que dá o mesmo movimento sem
 * somar uma dependência de animação ao bundle. Também pausa fora da viewport
 * e respeita `prefers-reduced-motion`.
 */

const VIEW_W = 1200;
const VIEW_H = 520;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const EDGE_PAD = 6;

export type TextLoopShape = "wave" | "circle" | "infinity" | "arch" | "line";

function buildPath(shape: TextLoopShape, curviness: number, ribbonWidth: number): string {
  const c = Math.max(0, curviness);
  const room = Math.max(20, CY - Math.max(0, ribbonWidth) / 2 - EDGE_PAD);

  switch (shape) {
    case "circle": {
      const r = Math.min(90 + c * 0.95, room);
      return `M ${CX - r} ${CY} A ${r} ${r} 0 1 1 ${CX + r} ${CY} A ${r} ${r} 0 1 1 ${CX - r} ${CY} Z`;
    }
    case "infinity": {
      const r = 150 + c * 1.4;
      const h = Math.min(60 + c * 0.95, room);
      return [
        `M ${CX} ${CY}`,
        `C ${CX + r * 0.55} ${CY - h} ${CX + r} ${CY - h} ${CX + r} ${CY}`,
        `C ${CX + r} ${CY + h} ${CX + r * 0.55} ${CY + h} ${CX} ${CY}`,
        `C ${CX - r * 0.55} ${CY - h} ${CX - r} ${CY - h} ${CX - r} ${CY}`,
        `C ${CX - r} ${CY + h} ${CX - r * 0.55} ${CY + h} ${CX} ${CY}`,
        "Z",
      ].join(" ");
    }
    case "arch": {
      const rise = Math.min(120 + c * 1.1, room * 2);
      return `M 120 ${CY + rise / 2} Q ${CX} ${CY - rise * 1.5} ${VIEW_W - 120} ${CY + rise / 2}`;
    }
    case "line":
      return `M -320 ${CY} L ${VIEW_W + 320} ${CY}`;
    case "wave":
    default: {
      const a = Math.min(c * 2.2, room * 2);
      return `M -320 ${CY} Q -160 ${CY - a} 0 ${CY} T 320 ${CY} T 640 ${CY} T 960 ${CY} T 1280 ${CY} T ${VIEW_W + 320} ${CY}`;
    }
  }
}

export interface TextLoopProps {
  /** frase repetida ao longo da curva */
  text?: string;
  /** curva pronta usada quando `path` não é informado */
  shape?: TextLoopShape;
  /** path SVG próprio, desenhado num viewBox 1200x520 — sobrepõe `shape` */
  path?: string;
  /** velocidade ao longo do path, em unidades por segundo */
  speed?: number;
  direction?: "forward" | "reverse";
  /** glifo entre cada repetição */
  separator?: string;
  /** amplitude da onda, ou o raio das formas fechadas */
  curviness?: number;
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
  uppercase?: boolean;
  color?: string;
  /** faixa sólida desenhada atrás do texto */
  ribbon?: boolean;
  ribbonColor?: string;
  ribbonWidth?: number;
  pauseOnHover?: boolean;
  /** altura fixa da faixa em px: o SVG passa a preencher e cortar o excesso */
  height?: number;
  /**
   * Recorta o viewBox na extensão vertical real da curva (traço incluído), em
   * vez de manter os 520 do original. A faixa fica só com a altura que o
   * desenho ocupa e nada é cortado — ao contrário de `height`, que preenche e
   * decepa o que sobra. Ignorada quando `height` é passada.
   */
  autoBand?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function TextLoop({
  text = "React ✦ Bits",
  shape = "wave",
  path,
  speed = 90,
  direction = "forward",
  separator = "✦",
  curviness = 90,
  fontSize = 46,
  fontWeight = 800,
  letterSpacing = 2,
  uppercase = true,
  color = "#ffffff",
  ribbon = true,
  ribbonColor = "#5227FF",
  ribbonWidth = 86,
  pauseOnHover = true,
  height,
  autoBand = false,
  className = "",
  style = {},
}: TextLoopProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const measureRef = useRef<SVGTextElement>(null);
  const headRef = useRef<SVGTextPathElement>(null);
  const [metrics, setMetrics] = useState({ length: 0, unitWidth: 0, reps: 2 });
  const [band, setBand] = useState<{ y: number; h: number } | null>(null);

  const rawId = useId();
  const pathId = `text-loop-${rawId.replace(/:/g, "")}`;

  const d = useMemo(
    () => path || buildPath(shape, curviness, ribbonWidth),
    [path, shape, curviness, ribbonWidth],
  );

  const unit = useMemo(() => {
    const base = uppercase ? String(text).toUpperCase() : String(text);
    const gap = separator ? `\u00A0${separator}\u00A0` : "\u00A0\u00A0\u00A0";
    return `${base}${gap}`;
  }, [text, separator, uppercase]);

  const textStyle = useMemo(
    () => ({ fontSize: `${fontSize}px`, fontWeight, letterSpacing: `${letterSpacing}px` }),
    [fontSize, fontWeight, letterSpacing],
  );

  useLayoutEffect(() => {
    const pathEl = pathRef.current;
    const measureEl = measureRef.current;
    if (!pathEl || !measureEl) return undefined;

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      let length = 0;
      let unitWidth = 0;
      try {
        length = pathEl.getTotalLength();
        unitWidth = measureEl.getComputedTextLength();
      } catch {
        return;
      }
      if (!length) return;

      // Repete a unidade sem esticar os glifos. Duas unidades extras cobrem as
      // pontas enquanto o startOffset percorre exatamente uma unidade.
      const reps = unitWidth > 0 ? Math.max(2, Math.ceil(length / unitWidth) + 2) : 2;
      setMetrics((prev) =>
        prev.length === length && prev.unitWidth === unitWidth && prev.reps === reps
          ? prev
          : { length, unitWidth, reps },
      );

      if (!autoBand) return;
      /* getBBox ignora o traço; a fita ocupa metade dele para cada lado */
      const box = pathEl.getBBox();
      const pad = (ribbon ? ribbonWidth : 0) / 2 + 6;
      const y = Math.round(box.y - pad);
      const h = Math.round(box.height + pad * 2);
      if (h > 0) setBand((prev) => (prev && prev.y === y && prev.h === h ? prev : { y, h }));
    };

    measure();
    // a medida só fecha depois que a fonte real carrega
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [d, unit, fontSize, fontWeight, letterSpacing, autoBand, ribbon, ribbonWidth]);

  useEffect(() => {
    const { unitWidth } = metrics;
    const head = headRef.current;
    const root = rootRef.current;
    if (!head || !unitWidth) return undefined;

    /* A frase já vem repetida. Deslocar exatamente a largura medida de uma
       unidade fecha o ciclo sem `textLength`, que achatava/esticava as letras. */
    const apply = (phase: number) => head.setAttribute("startOffset", String(phase - unitWidth));

    apply(0);

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || speed <= 0) return undefined;

    let phase = 0;
    let last = performance.now();
    let raf = 0;
    let hovered = false;
    let visible = true;
    const dir = direction === "reverse" ? -1 : 1;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!hovered && visible) {
        phase += dir * speed * dt;
        phase = ((phase % unitWidth) + unitWidth) % unitWidth;
        apply(phase);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onEnter = () => {
      hovered = true;
    };
    const onLeave = () => {
      hovered = false;
    };
    if (pauseOnHover && root) {
      root.addEventListener("pointerenter", onEnter);
      root.addEventListener("pointerleave", onLeave);
    }

    // fora da tela o loop não precisa girar
    let io: IntersectionObserver | undefined;
    if (root && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
      });
      io.observe(root);
    }

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      if (pauseOnHover && root) {
        root.removeEventListener("pointerenter", onEnter);
        root.removeEventListener("pointerleave", onLeave);
      }
    };
  }, [metrics, speed, direction, pauseOnHover]);

  const loopText = unit.repeat(metrics.reps);
  const fixed = typeof height === "number";
  const cropped = !fixed && autoBand && band;
  const viewBox = cropped ? `0 ${band.y} ${VIEW_W} ${band.h}` : `0 0 ${VIEW_W} ${VIEW_H}`;

  return (
    <div
      ref={rootRef}
      className={`text-loop${fixed ? " is-fixed" : ""} ${className}`.trim()}
      style={fixed ? { height, ...style } : style}
    >
      <svg
        className="text-loop-svg"
        viewBox={viewBox}
        preserveAspectRatio={fixed ? "xMidYMid slice" : "xMidYMid meet"}
        role="img"
        aria-label={text}
      >
        <path
          ref={pathRef}
          id={pathId}
          d={d}
          fill="none"
          stroke={ribbon ? ribbonColor : "none"}
          strokeWidth={ribbon ? ribbonWidth : 0}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <text ref={measureRef} className="text-loop-measure" style={textStyle} aria-hidden="true">
          {unit}
        </text>

        <text
          className="text-loop-text"
          style={textStyle}
          fill={color}
          dominantBaseline="central"
          aria-hidden="true"
        >
          <textPath ref={headRef} href={`#${pathId}`} startOffset={0}>
            {loopText}
          </textPath>
        </text>
      </svg>
    </div>
  );
}

export default TextLoop;

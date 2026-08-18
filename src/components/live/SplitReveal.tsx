import { useLayoutEffect, useMemo, useRef, useState, type ElementType } from "react";
import { motion, type TargetAndTransition } from "motion/react";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";

/**
 * Reveal de texto equivalente ao SplitText/GSAP da landing de referência.
 * Presets:
 *
 *   default          chars, y 2rem, opacity 0        1.5s power3.out     stagger .05
 *   from-right-blur  chars, x 6rem, blur .6rem,
 *                    scale 1.2                       1.5s back.out(1.2)  stagger .05
 *   from-down-blur   linhas, y 50%, blur .2rem       1.5s power2.out     stagger .2
 *
 * A árvore renderizada é sempre a mesma, com ou sem `prefers-reduced-motion`:
 * o servidor não conhece a preferência, então trocar a estrutura em função
 * dela quebra a hidratação. Sob reduced motion o que muda é só o estado
 * inicial — o texto já nasce visível.
 */

/** cubic-bezier no formato que o Motion aceita como `ease` */
type Bezier = [number, number, number, number];

type Preset = {
  hidden: TargetAndTransition;
  visible: TargetAndTransition;
  duration: number;
  ease: Bezier;
  stagger: number;
  unit: "chars" | "lines";
};

const PRESETS: Record<string, Preset> = {
  default: {
    hidden: { opacity: 0, y: "2rem" },
    visible: { opacity: 1, y: "0rem" },
    duration: 1.5,
    ease: [0.215, 0.61, 0.355, 1] as Bezier, // power3.out
    stagger: 0.05,
    unit: "chars",
  },
  "from-right-blur": {
    hidden: { opacity: 0, x: "6rem", filter: "blur(0.6rem)", scale: 1.2 },
    visible: { opacity: 1, x: "0rem", filter: "blur(0rem)", scale: 1 },
    duration: 1.5,
    ease: [0.34, 1.4, 0.64, 1] as Bezier, // back.out(1.2)
    stagger: 0.05,
    unit: "chars",
  },
  "from-down-blur": {
    hidden: { opacity: 0, y: "50%", filter: "blur(0.2rem)" },
    visible: { opacity: 1, y: "0%", filter: "blur(0rem)" },
    duration: 1.5,
    ease: [0.22, 0.61, 0.36, 1] as Bezier, // power2.out
    stagger: 0.2,
    unit: "lines",
  },
};

type Gesture = Record<string, unknown>;

/**
 * Divisão em linhas de verdade, como o SplitText da GSAP faz.
 *
 * Não é só a animação que muda: embrulhar cada linha num bloco com
 * `white-space: nowrap` redefine o `max-content` do elemento — ele passa a ser
 * a largura da LINHA MAIS LARGA, não a do texto corrido. É também o que
 * habilita o stagger por linha, que sem a divisão não tem em quê aplicar.
 *
 * A medição só é possível depois do layout, então o primeiro render sai com as
 * palavras soltas — igual no servidor e no cliente, o que mantém a hidratação
 * intacta — e o agrupamento entra no layout effect seguinte, antes da pintura.
 */
function LineReveal({
  MotionTag,
  text,
  config,
  from,
  reduce,
  delay,
  gesto,
  className,
  layout,
  ...rest
}: {
  MotionTag: ElementType;
  text: string;
  config: Preset;
  from: TargetAndTransition;
  reduce: boolean;
  delay: number;
  gesto: Gesture;
  className?: string;
  layout?: string;
}) {
  const hostRef = useRef<HTMLElement>(null);
  const larguraRef = useRef(0);
  const fontesRef = useRef(false);
  const [lines, setLines] = useState<string[] | null>(null);
  const words = useMemo(() => text.split(/(\s+)/).filter((w) => w !== ""), [text]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const medir = () => {
      const spans = host.querySelectorAll<HTMLElement>("[data-word]");
      if (!spans.length) return;
      const agrupadas: string[][] = [];
      let topoAtual: number | null = null;
      for (const span of spans) {
        const topo = span.offsetTop;
        // tolerância de 2px: subpixel de fonte não deve abrir linha nova
        if (topoAtual === null || Math.abs(topo - topoAtual) > 2) {
          agrupadas.push([]);
          topoAtual = topo;
        }
        agrupadas[agrupadas.length - 1].push(span.dataset.word ?? "");
      }
      setLines(agrupadas.map((l) => l.join("")));
    };

    if (lines === null) medir();

    /*
     * O gatilho de remedição é o resize da JANELA, não um ResizeObserver.
     *
     * Observar o pai parecia seguro — observar o próprio host é um laço óbvio —
     * mas o pai desta headline é um flex column com `align-items: center`, e a
     * largura de uma caixa dessas é a do maior filho. Agrupar em linhas com
     * `nowrap` encolhe o host, o pai encolhe junto, o observador dispara,
     * `setLines(null)` devolve as palavras soltas, o pai volta a crescer — e o
     * ciclo recomeça a cada frame. Era isso que travava a página inteira: o
     * renderer nem respondia a um `Runtime.evaluate`.
     *
     * A quebra de linha só muda quando a largura disponível muda, e na prática
     * quem muda isso é a viewport. Ouvir `resize` cobre o caso real sem criar
     * realimentação entre o layout e o próprio componente.
     */
    larguraRef.current = window.innerWidth;
    const aoRedimensionar = () => {
      if (Math.abs(window.innerWidth - larguraRef.current) < 1) return;
      larguraRef.current = window.innerWidth;
      setLines(null);
    };
    window.addEventListener("resize", aoRedimensionar);

    /*
     * Com a fonte de fallback o texto quebra em outros pontos, então um
     * agrupamento medido antes da fonte real chegar fica errado. O guard é o
     * que impede o laço: sem ele, `setLines(null)` reagenda o effect, que
     * agenda outro fonts.ready, que zera de novo, sem fim.
     */
    let vivo = true;
    if (!fontesRef.current) {
      document.fonts?.ready.then(() => {
        if (!vivo || fontesRef.current) return;
        fontesRef.current = true;
        setLines(null);
      });
    }

    return () => {
      vivo = false;
      window.removeEventListener("resize", aoRedimensionar);
    };
  }, [text, lines]);

  const variantes = (i: number) => ({
    hidden: from,
    visible: {
      ...config.visible,
      transition: reduce
        ? { duration: 0 }
        : {
            duration: config.duration,
            ease: config.ease,
            delay: delay + i * config.stagger,
          },
    },
  });

  return (
    <MotionTag
      ref={hostRef}
      className={className}
      initial="hidden"
      {...gesto}
      aria-label={text}
      style={{ display: layout }}
      {...rest}
    >
      {lines === null
        ? /* primeira passagem: palavras soltas, para medir onde o navegador
             quebrou. Já com as variantes, para o texto aparecer mesmo que o
             agrupamento demore ou falhe. */
          words.map((w, i) => (
            <motion.span
              key={i}
              data-word={w}
              aria-hidden="true"
              style={{ display: "inline-block", whiteSpace: "pre" }}
              variants={variantes(0)}
            >
              {w}
            </motion.span>
          ))
        : lines.map((line, i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              /* nowrap é o que faz o max-content virar a largura desta linha */
              style={{ display: "block", whiteSpace: "nowrap" }}
              variants={variantes(i)}
            >
              {line}
            </motion.span>
          ))}
    </MotionTag>
  );
}

export function SplitReveal({
  text,
  preset = "from-right-blur",
  as: Tag = "span",
  className = "",
  delay = 0,
  /*
   * `start: 'top 80%'` do ScrollTrigger é uma regra de POSIÇÃO; `amount` no
   * Motion é uma regra de ÁREA. Encolher a raiz do observador em 20% embaixo
   * reproduz a regra de posição — por isso `amount` é 0: quem decide é a
   * margem.
   */
  amount = 0,
  /*
   * Disparo controlado de fora, para blocos em que a seção inteira revela de
   * uma vez, inclusive os itens ainda abaixo da dobra.
   */
  active,
  /*
   * A borda de cima é esticada de propósito: `once` no ScrollTrigger é por
   * ESTADO, no IntersectionObserver é por CRUZAMENTO. Num F5 com a página já
   * rolada, um observador comum deixaria o texto invisível para sempre.
   */
  margin = "10000px 0px -20% 0px",
  ...rest
}: {
  text: string;
  preset?: keyof typeof PRESETS | string;
  as?: string;
  className?: string;
  delay?: number;
  amount?: number;
  active?: boolean;
  margin?: string;
  [key: string]: unknown;
}) {
  const reduce = useReducedMotionSafe();
  const config = PRESETS[preset] ?? PRESETS["from-right-blur"];
  const MotionTag = ((motion as unknown as Record<string, ElementType>)[Tag] ??
    motion.span) as ElementType;
  const viewport = { once: true, amount, margin };
  const controlado = active !== undefined;
  const gesto: Gesture = controlado
    ? { animate: active ? "visible" : "hidden" }
    : { whileInView: "visible", viewport };

  /*
   * Estilo inline vence a folha de estilo, então forçar `display` aqui
   * sequestraria o layout de quem passa `className`. Quando há className, o
   * display fica com o CSS da seção.
   */
  const layout = className ? undefined : "inline-block";

  // sob reduced motion o texto parte já no estado final, sem transição
  const from: TargetAndTransition = reduce ? config.visible : config.hidden;

  if (config.unit === "lines") {
    return (
      <LineReveal
        MotionTag={MotionTag}
        text={text}
        config={config}
        from={from}
        reduce={reduce}
        delay={delay}
        gesto={gesto}
        className={className}
        layout={layout}
        {...rest}
      />
    );
  }

  const pieces = Array.from(text);

  return (
    <MotionTag
      className={className}
      initial="hidden"
      {...gesto}
      aria-label={text}
      /* cada caractere é inline-block; sem nowrap a palavra quebraria
         no meio quando a headline não cabe em uma linha */
      style={{ display: layout, whiteSpace: "nowrap" }}
      {...rest}
    >
      {pieces.map((piece, i) => {
        if (piece.trim() === "") {
          return <span key={i}>{piece}</span>;
        }
        return (
          <motion.span
            key={i}
            aria-hidden="true"
            style={{ display: "inline-block", whiteSpace: "pre" }}
            variants={{
              hidden: from,
              visible: {
                ...config.visible,
                transition: reduce
                  ? { duration: 0 }
                  : {
                      duration: config.duration,
                      ease: config.ease,
                      delay: delay + i * config.stagger,
                    },
              },
            }}
          >
            {piece}
          </motion.span>
        );
      })}
    </MotionTag>
  );
}

export default SplitReveal;

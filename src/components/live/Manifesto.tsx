import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, type MotionValue, type Variants } from "motion/react";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";

/**
 * MANIFESTO — a headline com cápsulas inline da landing de referência.
 *
 * A cápsula de lá não é uma pastilha rotulada: é uma caixa de contorno fino e
 * fundo quase preto, de cantos muito arredondados, com um objeto abstrato
 * girando dentro — nenhum texto. Lá esse objeto é um Lottie; aqui é um SVG
 * desenhado à mão e animado pelo Motion, um por cápsula, girando devagar o
 * bastante para ser presença e não distração.
 *
 * A entrada é a da referência (`view-item="about-tag"`): a caixa cresce de 0
 * até o tamanho final em 2s de expo.out, com a margem abrindo junto e um
 * stagger de 100ms entre vizinhas. Como a cápsula vive dentro de um flex, é o
 * próprio crescimento que empurra as palavras para os lados — o deslocamento
 * que lá era calculado em JS aqui sai de graça do fluxo.
 *
 * Depois da headline, o parágrafo é revelado palavra a palavra pelo progresso
 * de scroll, como a segunda pista pinada de lá.
 */

/* Proporções da cápsula em `em` sobre o corpo da headline. A referência mede
   11.5rem x 8rem num texto de 6.94rem, raio 3rem e margem 2rem — e lá
   `1rem = 1vw`. Aqui o rem é fixo em 16px, então o que atravessa não são os
   números e sim as razões: 11.5/6.94 = 1.657em, 8/6.94 = 1.153em. */
const CAP_W = "1.657em";
const CAP_H = "1.153em";
const CAP_MARGIN = "0.288em";

/* expo.out — o easing com que a referência abre a cápsula */
const EXPO_OUT: [number, number, number, number] = [0.19, 1, 0.22, 1];

const capsuleVariants = (delay: number, instant: boolean): Variants => ({
  hidden: {
    width: "0em",
    height: "0em",
    opacity: 0,
    marginLeft: "0.072em",
    marginRight: "0.072em",
  },
  visible: {
    width: CAP_W,
    height: CAP_H,
    opacity: 1,
    marginLeft: CAP_MARGIN,
    marginRight: CAP_MARGIN,
    transition: instant
      ? { duration: 0 }
      : {
          width: { duration: 2, ease: EXPO_OUT, delay },
          height: { duration: 2, ease: EXPO_OUT, delay },
          marginLeft: { duration: 2, ease: EXPO_OUT, delay },
          marginRight: { duration: 2, ease: EXPO_OUT, delay },
          opacity: { duration: 0.2, delay },
        },
  },
});

/**
 * Uma volta completa, sem fim e sem aceleração.
 *
 * Sob movimento reduzido o `motion.g` continua existindo e só perde o giro —
 * trocá-lo por um `<g>` solto remontaria a subárvore no primeiro effect, e
 * trocar a prop por `undefined` deixaria no DOM o último transform escrito.
 */
function Spin({
  dur,
  reverse = false,
  still,
  children,
}: {
  dur: number;
  reverse?: boolean;
  still: boolean;
  children: ReactNode;
}) {
  return (
    <motion.g
      style={{ transformOrigin: "60px 40px" }}
      animate={{ rotate: still ? 0 : reverse ? -360 : 360 }}
      transition={still ? { duration: 0 } : { duration: dur, repeat: Infinity, ease: "linear" }}
    >
      {children}
    </motion.g>
  );
}

/* Os três objetos partilham a caixa 120x80 — a mesma razão 12/8 da cápsula —
   e giram em torno de (60, 40). Traço fino, `currentColor`, sem preenchimento:
   quem dá a cor é a cápsula. */

/** 1 — órbita: um anel inclinado leva um satélite em volta do núcleo */
function ObjectOrbit({ still }: { still: boolean }) {
  return (
    <svg viewBox="0 0 120 80" fill="none" aria-hidden="true">
      <circle cx="60" cy="40" r="7.5" stroke="currentColor" strokeWidth="1.2" opacity="0.9" />
      <Spin dur={26} still={still}>
        <ellipse
          cx="60"
          cy="40"
          rx="30"
          ry="12"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.5"
        />
        <circle cx="90" cy="40" r="3" fill="currentColor" opacity="0.9" />
      </Spin>
      <Spin dur={19} reverse still={still}>
        <ellipse
          cx="60"
          cy="40"
          rx="17"
          ry="27"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.28"
        />
      </Spin>
    </svg>
  );
}

/** 2 — anéis: três aros tracejados em ritmos e sentidos diferentes */
function ObjectRings({ still }: { still: boolean }) {
  return (
    <svg viewBox="0 0 120 80" fill="none" aria-hidden="true">
      <Spin dur={32} still={still}>
        <circle
          cx="60"
          cy="40"
          r="30"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.3"
          strokeDasharray="17 11"
        />
      </Spin>
      <Spin dur={21} reverse still={still}>
        <circle
          cx="60"
          cy="40"
          r="21"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.5"
          strokeDasharray="33 21"
        />
      </Spin>
      <circle cx="60" cy="40" r="12" stroke="currentColor" strokeWidth="1.2" opacity="0.85" />
      <circle cx="60" cy="40" r="2.4" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

/** 3 — prisma: losango e triângulo girando em sentidos opostos */
function ObjectPrism({ still }: { still: boolean }) {
  return (
    <svg viewBox="0 0 120 80" fill="none" aria-hidden="true">
      <circle cx="60" cy="40" r="31" stroke="currentColor" strokeWidth="1" opacity="0.18" />
      <Spin dur={25} still={still}>
        <rect
          x="42"
          y="22"
          width="36"
          height="36"
          rx="8"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.55"
        />
      </Spin>
      <Spin dur={17} reverse still={still}>
        {/* equilátero de raio 21 centrado em (60, 40), para girar sem bambear */}
        <path
          d="M60 19 L78.19 50.5 L41.81 50.5 Z"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
          opacity="0.8"
        />
      </Spin>
    </svg>
  );
}

const CAPSULES = [ObjectOrbit, ObjectRings, ObjectPrism];

const HEADLINE_VARIANTS: Variants = { hidden: {}, visible: {} };

/**
 * Quem observa o scroll é a headline, não a cápsula.
 *
 * Não é preferência de estilo: no estado inicial a cápsula mede 0x0 e um
 * `IntersectionObserver` com limiar > 0 nunca dispara para uma caixa sem área
 * — a cápsula ficaria fechada para sempre. A headline tem tamanho de verdade,
 * e o Motion propaga o estado de variante dela para os filhos, que continuam
 * com o próprio `transition` e o próprio atraso.
 */
function Capsule({ index, reduce }: { index: number; reduce: boolean }) {
  const Shape = CAPSULES[index];
  return (
    <motion.span
      className={`manifesto-capsule s${index + 1}`}
      variants={capsuleVariants((index + 1) * 0.1, reduce)}
      aria-hidden="true"
    >
      <span className="manifesto-capsule-object">
        <Shape still={reduce} />
      </span>
    </motion.span>
  );
}

const LEDE =
  "Enquanto você mostra o produto, ela responde quem perguntou o frete, refixa a oferta que sumiu do topo e narra a promoção em voz alta. Você não perde mais nenhuma venda por estar ocupado com a câmera.";

function Word({
  index,
  total,
  progress,
  reduce,
  children,
}: {
  index: number;
  total: number;
  progress: MotionValue<number>;
  reduce: boolean;
  children: ReactNode;
}) {
  /* o parágrafo ocupa a segunda metade do curso; cada palavra acende dentro de
     uma janela curta, deslizando pela frase */
  const step = 0.42 / total;
  const from = 0.52 + index * step;
  const opacity = useTransform(progress, [from, from + step * 2.5], [0.16, 1]);

  return (
    <motion.span className="manifesto-word" style={reduce ? undefined : { opacity }}>
      {children}
    </motion.span>
  );
}

export function Manifesto() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionSafe();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const words = LEDE.split(" ");

  return (
    <section id="manifesto" className="manifesto">
      <div className="manifesto-height" ref={ref}>
        <div className="manifesto-pin">
          <div className="wrap">
            <motion.h2
              className="manifesto-headline"
              /* a headline não anima nada por conta própria; as variantes
                 vazias só a tornam o nó que decide o estado das cápsulas */
              variants={HEADLINE_VARIANTS}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
            >
              <span className="manifesto-line">
                <span>Você</span>
                <Capsule index={0} reduce={reduce} />
                <span>apresenta.</span>
              </span>
              <span className="manifesto-line manifesto-line--2">
                <span>A IA</span>
                <Capsule index={1} reduce={reduce} />
                <span className="h1-serif">responde.</span>
              </span>
              <span className="manifesto-line manifesto-line--3">
                <span>E a live</span>
                <Capsule index={2} reduce={reduce} />
                <span>não para.</span>
              </span>
            </motion.h2>

            <p className="manifesto-lede">
              {words.map((word, i) => (
                <Word
                  key={`${word}-${i}`}
                  index={i}
                  total={words.length}
                  progress={scrollYProgress}
                  reduce={reduce}
                >
                  {word}{" "}
                </Word>
              ))}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Manifesto;

import { Fragment } from "react";
import { Coffee, MousePointerClick, Timer } from "lucide-react";
import { motion } from "motion/react";
import { StepPhone, type StepPhoneState } from "@/components/live/StepPhone";
import { SplitReveal } from "@/components/live/SplitReveal";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";

/**
 * COMO FUNCIONA — arranjo `what-is` da landing de referência.
 *
 * Antes eram três cards de caixa fechada numa grade, com o aparelho
 * espiando por baixo da borda no hover: a seção lia como uma tabela e o
 * produto só aparecia para quem passasse o mouse.
 *
 * O que veio da referência:
 *
 * · três colunas separadas por FIO, não por caixa. Sem fundo, sem borda,
 *   sem raio — o que separa um passo do outro é uma linha de 1px a 20%
 *   de opacidade, e é isso que faz a seção respirar.
 * · ZIG-ZAG vertical: o passo do meio inverte a ordem (texto em cima,
 *   aparelho embaixo). Na referência é a diferença entre a `s1` e a `s2`,
 *   e é o que impede a fileira de virar três colunas idênticas.
 * · o aparelho entra por `view-item="from-center"` (scale .6 -> 1 em 2s
 *   expo.out) e o texto por `from-down-blur`, linha a linha — o desenho
 *   forma antes da frase, como lá.
 * · um borrão de cor atrás de cada aparelho, o `.what-is-blur`. Aqui ele
 *   é `radial-gradient` e não `filter: blur()`: um desfoque de superfície
 *   grande atrás de três telas animadas é refeito a cada quadro.
 *
 * O que NÃO veio: o `z-index: 100` da referência. A landing opera numa
 * escala baixa (nav 90, moldura 92) e a seção passaria por cima da nav.
 */

const STEPS: Array<{
  n: number;
  title: string;
  desc: string;
  meta: string;
  icon: typeof Timer;
  state: StepPhoneState;
}> = [
  {
    n: 1,
    title: "Instale o app",
    desc: "Baixe, entre com seu e-mail e cadastre os produtos da vitrine com preço, ficha técnica e prazo de entrega.",
    meta: "Leva cerca de 3 minutos",
    icon: Timer,
    state: "setup",
  },
  {
    n: 2,
    title: "Abra sua live",
    desc: "Comece a transmissão no TikTok Shop normalmente. A Pitch AI reconhece a live e assume o chat e a vitrine.",
    meta: "2 cliques",
    icon: MousePointerClick,
    state: "live",
  },
  {
    n: 3,
    title: "Deixe a IA trabalhar",
    desc: "Ela responde dúvidas, refixa o produto ativo, narra as ofertas e avisa você quando alguém compra.",
    meta: "O resto da live",
    icon: Coffee,
    state: "selling",
  },
];

/** [view-item="from-center"] — mantido existindo sob reduced motion e apenas
 *  encurtado; trocar a prop por `undefined` deixaria o aparelho preso no
 *  `opacity: 0` que o Motion já escreveu inline. */
const fromCenter = (reduce: boolean) => ({
  hidden: { opacity: 0, scale: 0.6 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: reduce
      ? { duration: 0.15 }
      : {
          scale: { duration: 2, ease: [0.19, 1, 0.22, 1] as [number, number, number, number] },
          opacity: { duration: 0.2 },
        },
  },
});

function Widget({ state, reduce }: { state: StepPhoneState; reduce: boolean }) {
  return (
    <div className="hows-widget">
      <span className="hows-glow" aria-hidden="true" />
      <motion.div
        className="hows-phone"
        variants={fromCenter(reduce)}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
      >
        <StepPhone state={state} />
      </motion.div>
    </div>
  );
}

function Text({ step }: { step: (typeof STEPS)[number] }) {
  const Icon = step.icon;
  return (
    <div className="hows-text">
      <span className="hows-n">{String(step.n).padStart(2, "0")}</span>
      <SplitReveal as="h3" className="hows-title" text={step.title} preset="from-down-blur" />
      <SplitReveal
        as="p"
        className="hows-desc"
        text={step.desc}
        preset="from-down-blur"
        delay={0.12}
      />
      <span className="hows-meta">
        <Icon /> {step.meta}
      </span>
    </div>
  );
}

export function HowSteps() {
  const reduce = useReducedMotionSafe();

  return (
    <section id="como" className="bordered hows">
      <div className="aurora sec-aurora aurora-c" aria-hidden="true" />
      <div className="wrap">
        <div className="sec-head rv">
          <div className="eyebrow">Como funciona</div>
          <h2>
            Do download à primeira venda em{" "}
            <span className="h1-serif nowrap" style={{ fontStyle: "italic" }}>
              5 minutos.
            </span>
          </h2>
          <p>
            Sem integração, sem API, sem configurar servidor. A Pitch AI roda junto com a sua live e
            você continua no controle o tempo todo.
          </p>
        </div>

        <div className="hows-list">
          {STEPS.map((step, index) => (
            <Fragment key={step.n}>
              <article className={`hows-item hows-item--s${step.n}`}>
                {/* o do meio inverte: é o zig-zag da referência */}
                {index === 1 ? (
                  <>
                    <Text step={step} />
                    <Widget state={step.state} reduce={reduce} />
                  </>
                ) : (
                  <>
                    <Widget state={step.state} reduce={reduce} />
                    <Text step={step} />
                  </>
                )}
              </article>
              {index < STEPS.length - 1 ? <div className="hows-rule" aria-hidden="true" /> : null}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HowSteps;

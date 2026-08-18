import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";

/**
 * LOGO REVEAL — sete anéis que convergem e revelam o emblema da Pitch AI.
 *
 * A mecânica é a da landing de referência: uma seção alta (200vh) com um
 * miolo grudado na viewport, e todo o movimento amarrado ao progresso do
 * scroll — `start top bottom` -> `end bottom top`, ou seja
 * p = scrollY / (altura da seção + viewport).
 *
 * Os keyframes seguem os de lá:
 *
 *    0%   anéis deslocados para fora, opacity 0
 *   20%   começam a convergir
 *   35%   opacity 1
 *   55%   formação fechada (flor da vida), nada ainda gira
 *  100%   conjunto em scale 1.4 e rotate 360
 *
 * O que muda é o desenho: lá o miolo era um Lottie com a flor da vida da
 * marca original; aqui os anéis são SVG (sem dependência nova) e quem nasce
 * no centro deles é o emblema da Pitch AI.
 */

/** viewBox quadrado; tudo é medido a partir do centro */
const C = 200;
/** raio dos anéis — na flor da vida a distância entre centros é o próprio raio */
const R = 58;
/** distância inicial dos satélites: bem fora da formação */
const SPREAD = R * 3.6;

const ANGLES = [-90, -30, 30, 90, 150, 210];

/** Estado em que a seção para sob movimento reduzido: 55%, o quadro em que os
 *  anéis já convergiram e nada ainda gira. */
const REDUCED_AT = 0.55;

function Ring({ progress, angle }: { progress: MotionValue<number>; angle: number }) {
  const rad = (angle * Math.PI) / 180;
  const cx = useTransform(
    progress,
    [0.2, 0.55],
    [C + Math.cos(rad) * SPREAD, C + Math.cos(rad) * R],
  );
  const cy = useTransform(
    progress,
    [0.2, 0.55],
    [C + Math.sin(rad) * SPREAD, C + Math.sin(rad) * R],
  );
  const opacity = useTransform(progress, [0.2, 0.35], [0, 1]);

  return <motion.circle cx={cx} cy={cy} r={R} style={{ opacity }} />;
}

export function LogoReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionSafe();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  /* O progresso passa por um MotionValue próprio em vez de trocar `style` por
     `undefined` quando `reduce` liga: o Motion não apaga o que já escreveu
     inline, então aquele caminho deixaria a seção presa em opacity 0 — o
     estado do primeiro render, quando `useReducedMotionSafe` ainda vale
     false. */
  const progress = useMotionValue(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (!reduce) progress.set(v);
  });
  useEffect(() => {
    progress.set(reduce ? REDUCED_AT : scrollYProgress.get());
  }, [reduce, progress, scrollYProgress]);

  const groupScale = useTransform(progress, [0.55, 1], [1, 1.4]);
  const groupRotate = useTransform(progress, [0.55, 1], [0, 360]);
  const centerOpacity = useTransform(progress, [0.2, 0.35], [0, 1]);

  /* o emblema entra quando a formação já fechou, e sai da rotação do grupo —
     um logo girando 360° viraria enjoo, não marca */
  const markOpacity = useTransform(progress, [0.5, 0.68], [0, 1]);
  const markScale = useTransform(progress, [0.5, 0.75], [0.72, 1]);

  const glowOpacity = useTransform(progress, [0.35, 0.55], [0, 0.3]);

  return (
    <section className="logo-reveal" aria-label="Pitch AI">
      <div className="logo-reveal-height" ref={ref}>
        <div className="logo-reveal-subheight">
          <div className="logo-reveal-sticky">
            <motion.div
              className="logo-reveal-glow"
              style={{ opacity: glowOpacity }}
              aria-hidden="true"
            />

            <motion.div
              className="logo-reveal-stage"
              style={{ scale: groupScale, rotate: groupRotate }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 400 400" className="logo-reveal-svg">
                <motion.circle cx={C} cy={C} r={R} style={{ opacity: centerOpacity }} />
                {ANGLES.map((angle) => (
                  <Ring key={angle} progress={progress} angle={angle} />
                ))}
              </svg>
            </motion.div>

            <motion.div
              className="logo-reveal-mark"
              style={{ opacity: markOpacity, scale: markScale }}
            >
              <img src="/logo-nav.png" alt="" width={128} height={128} />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default LogoReveal;

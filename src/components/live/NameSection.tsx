import { motion } from "motion/react";
import { SplitReveal } from "./SplitReveal";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Wordmark colossal sobre o vídeo de gradiente — o fecho de marca antes do
 * CTA final, na mesma construção da landing de referência.
 *
 * O marquee roda SÓ no mobile: no desktop a referência mantém o wordmark
 * único e estático (medido lá, o transform fica em `none`), e é na tela
 * estreita que ele vira uma esteira de quatro cópias andando 80% em 40s.
 *
 * A esteira também é disparada por entrada em tela, não no mount — ligar no
 * mount deixa a fita numa fase aleatória quando o usuário finalmente chega
 * aqui.
 */

const BLOCKS = 4;

export function NameSection() {
  const reduce = useReducedMotionSafe();
  const isMobile = useIsMobile();
  const marquee = isMobile && !reduce;

  return (
    <section className="name-sc" aria-label="Pitch AI">
      <div className="name-inner">
        <div className="name-text">
          <SplitReveal
            as="p"
            className="name-tag"
            text="Automação de live commerce, feita no Brasil"
            preset="from-down-blur"
          />

          <div className="name-headline-wrap">
            <motion.div
              className="name-headline-path"
              whileInView={marquee ? { x: ["0%", "-80%"] } : undefined}
              viewport={{ once: true }}
              transition={marquee ? { duration: 40, repeat: Infinity, ease: "linear" } : undefined}
            >
              {Array.from({ length: BLOCKS }, (_, i) => (
                <div
                  key={i}
                  className={
                    i === 0
                      ? "name-headline-block"
                      : "name-headline-block name-headline-block--repeat"
                  }
                  aria-hidden={i > 0 ? "true" : undefined}
                >
                  <SplitReveal
                    as="p"
                    className="name-headline"
                    text="pitchai"
                    preset="from-right-blur"
                  />
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        <div className="name-bg" aria-hidden="true">
          <video
            className="name-bg-video"
            src="/assets/video/name-gradient.mp4"
            autoPlay={!reduce}
            loop
            muted
            playsInline
            preload="none"
          />
          <div className="name-bg-mask" />
        </div>
      </div>
    </section>
  );
}

export default NameSection;

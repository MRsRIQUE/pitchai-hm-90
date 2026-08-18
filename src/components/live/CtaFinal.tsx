import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useInView } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Velaris } from "@/components/ui/velaris";
import { PhoneShowcase } from "@/components/live/PhoneShowcase";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";

/**
 * CTA FINAL — híbrido das duas landings.
 *
 * O shader (Velaris) é o da landing atual: o gradiente vivo por trás do texto
 * substitui o glow estático. O layout e as entradas são os da referência — o
 * card cresce do centro (`from-center`) e o aparelho sobe do canto
 * (`from-down`), o que transforma o bloco final numa peça e não num rodapé.
 *
 * O aparelho é o mesmo `PhoneShowcase` do hero: moldura real com os vídeos da
 * demo tocando dentro. Ele só é montado quando a seção chega perto da tela —
 * sem isso um segundo player ficaria rodando no fim da página desde o
 * primeiro pixel, gastando banda e bateria de quem nunca chega até aqui.
 * Depois de montado, fica: desmontar a cada scroll recomeçaria o download.
 */

/** paleta do shader: roxo da marca desmaiando para o quase-preto */
const CTA_COLORS = ["#6d28d9", "#8b5cf6", "#4c1d95", "#12081f"];

const EXPO_OUT = [0.19, 1, 0.22, 1] as [number, number, number, number];

const fromCenter = (reduce: boolean) => ({
  hidden: { opacity: 0, scale: 0.6 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      scale: reduce ? { duration: 0.15 } : { duration: 2, ease: EXPO_OUT },
      opacity: { duration: reduce ? 0.15 : 0.2 },
    },
  },
});

const fromDown = (reduce: boolean) => ({
  hidden: { opacity: 0, scale: 0.6, y: "50%" },
  visible: {
    opacity: 1,
    scale: 1,
    y: "0%",
    transition: reduce
      ? { duration: 0.15 }
      : {
          scale: { duration: 2, ease: EXPO_OUT },
          y: { duration: 2, ease: EXPO_OUT },
          opacity: { duration: 0.2 },
        },
  },
});

export function CtaFinal() {
  const reduce = useReducedMotionSafe();

  /*
   * O gatilho de montagem é a SEÇÃO, não o aparelho: o aparelho entra
   * encolhido e deslocado por dois transforms encadeados (o do card e o
   * dele), e a caixa transformada pode não cruzar a viewport na hora certa
   * quando o scroll salta. A seção não tem transform nenhum — e a margem de
   * 300px dá tempo do primeiro quadro do vídeo chegar antes de aparecer.
   */
  const sectionRef = useRef<HTMLElement>(null);
  const showPhone = useInView(sectionRef, { once: true, margin: "300px" });

  return (
    <section className="cta-final" ref={sectionRef}>
      <div className="wrap">
        <motion.div
          className="cta-final-card"
          variants={fromCenter(reduce)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          <Velaris
            className="cta-final-shader"
            bg="#12081f"
            colors={CTA_COLORS}
            speed={1.2}
            grain={0.25}
            height="auto"
          >
            <div className="cta-final-inner">
              <div className="cta-final-text">
                <h2 className="cta-final-title">
                  A próxima live pode ser a primeira em que você só apresenta.
                </h2>
                <p className="cta-final-desc">
                  Instale, cadastre seus produtos e deixe a Pitch AI cuidar do chat, da vitrine e da
                  narração.
                </p>
                <div className="cta-final-actions">
                  <Link to="/app" className="btn btn-primary btn-lg btn-glow">
                    Escolher meu plano <ArrowRight style={{ width: 15, height: 15 }} />
                  </Link>
                  <Link to="/planos" className="btn btn-outline btn-lg">
                    Ver planos
                  </Link>
                </div>
              </div>

              {/*
                `amount: "some"` (qualquer sobreposição) e não 0.2: o estado
                inicial do from-down encolhe e empurra o elemento para baixo, e
                a caixa transformada nunca chega a 20% visível — com 0.2 o
                aparelho ficaria preso em opacity 0.
              */}
              <motion.div
                className="cta-final-phone"
                variants={fromDown(reduce)}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: "some" }}
                aria-hidden="true"
              >
                {showPhone ? <PhoneShowcase /> : null}
              </motion.div>
            </div>
          </Velaris>
        </motion.div>
      </div>
    </section>
  );
}

export default CtaFinal;

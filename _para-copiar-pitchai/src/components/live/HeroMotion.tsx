import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useMotionValue, useScroll } from "motion/react";
import { ArrowRight, Download } from "lucide-react";
import { Particles } from "./Particles";
import { PhoneShowcase } from "./PhoneShowcase";
import { SplitReveal } from "./SplitReveal";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";
import { useIntroReady } from "@/hooks/use-intro-ready";

/**
 * HERO — layout da landing de referência com o conteúdo da Pitch AI.
 *
 * O que vem da referência, medido lá e reproduzido aqui:
 *
 * · O wordmark entra por SplitReveal `from-right-blur` (char a char) e a
 *   tagline por `from-down-blur` (linha a linha).
 * · O card de CTA e o aparelho entram por [view-item="from-center"]:
 *   scale .6 -> 1 em 2s expo.out, opacity 0 -> 1 em .2s, disparo por
 *   IntersectionObserver com threshold .2, uma vez só e sem reverse.
 * · O vídeo de fundo NÃO tem transform em nenhum ponto de scroll — não há zoom.
 * · Quem se move no scroll é `.hero-mobile-point`: y 0 -> -28rem entre 0% e
 *   55% de uma janela de 3 viewports, ou seja 1.65 * innerHeight de scroll.
 * · Os dois vídeos de fundo (paisagem e retrato) existem juntos no DOM e quem
 *   escolhe é o CSS. Trocar por media query em JS remontaria o <video> no
 *   cliente e piscaria na primeira pintura.
 *
 * O aparelho é o da referência (PNG inclinado com a tela vazada), não o mock
 * retangular da landing antiga — decisão de layout tomada na fusão das duas.
 */

/** [view-item="from-center"] — mantido existindo sob reduced motion e apenas
 *  neutralizado; trocar a prop por `undefined` deixaria o elemento preso no
 *  `opacity: 0` que o Motion já escreveu inline. */
const fromCenter = (reduce: boolean) => ({
  hidden: { opacity: 0, scale: 0.6 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: reduce
      ? { duration: 0.15 }
      : {
          scale: { duration: 2, ease: [0.19, 1, 0.22, 1] },
          opacity: { duration: 0.2 },
        },
  },
});

export function HeroMotion() {
  const videosRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionSafe();
  /* a entrada do hero espera a cortina abrir — ver use-intro-ready */
  const intro = useIntroReady();

  const { scrollY } = useScroll();
  const variants = fromCenter(reduce);

  /*
   * y 0 -> -28rem ao longo de 1.65 viewports, depois trava.
   *
   * O valor é escrito à mão em vez de sair de um `useTransform` para que a
   * mudança de `reduce` — que só acontece depois da montagem — realmente
   * repinte o elemento.
   */
  const pointY = useMotionValue("0vw");

  useEffect(() => {
    const apply = (value: number) => {
      if (reduce) {
        pointY.set("0vw");
        return;
      }
      const viewport = window.innerHeight || 900;
      const t = Math.min(1, Math.max(0, value / (1.65 * viewport)));
      pointY.set(`${-28 * t}vw`);
    };
    apply(scrollY.get());
    return scrollY.on("change", apply);
  }, [reduce, scrollY, pointY]);

  /*
   * `autoPlay={!reduce}` seria uma armadilha: o atributo some no render
   * seguinte, mas o vídeo que já começou não para sozinho. O atributo fica
   * fixo — igual ao HTML do servidor — e quem pausa é este effect.
   *
   * Só toca o vídeo que está EM CENA. Os dois fundos (paisagem e retrato)
   * moram juntos no DOM e quem escolhe é o CSS, mas `display: none` não
   * interrompe a decodificação de um vídeo já rodando: sem este filtro, todo
   * desktop decodificava em silêncio o arquivo de retrato, e todo celular o de
   * paisagem. Reavalia no resize porque a media query pode virar a chave.
   */
  useEffect(() => {
    const host = videosRef.current;
    if (!host) return undefined;

    const sincronizar = () => {
      for (const video of host.querySelectorAll("video")) {
        const emCena = video.getClientRects().length > 0;
        if (reduce || !emCena) video.pause();
        else video.play().catch(() => {});
      }
    };

    sincronizar();
    window.addEventListener("resize", sincronizar);
    return () => window.removeEventListener("resize", sincronizar);
  }, [reduce]);

  return (
    <header className="hero-mega">
      <div className="hero-mega-inner">
        <div className="hero-mega-content">
          <div className="hero-mega-text">
            <div className="badge hero-mega-badge">
              <b>Novo</b>
              <span>Vozes neurais em português brasileiro</span>
            </div>

            <SplitReveal
              as="h1"
              className="hero-mega-title"
              text="pitchai"
              preset="from-right-blur"
              active={intro}
            />

            <SplitReveal
              as="p"
              className="hero-mega-tag"
              text="Sua live do TikTok Shop vendendo sozinha."
              preset="from-down-blur"
              active={intro}
              delay={0.35}
            />
          </div>

          <div className="hero-mega-down">
            <motion.div
              className="hero-mega-card"
              variants={variants}
              initial="hidden"
              animate={intro ? "visible" : "hidden"}
            >
              <div className="hero-mega-card-text">
                <p className="hero-mega-card-h">Comece hoje, sem fidelidade</p>
                <p className="hero-mega-card-s">A partir de R$ 27,90/mês</p>
              </div>
              <div className="hero-mega-card-actions">
                <Link to="/planos" className="btn btn-primary btn-lg btn-glow">
                  Ver planos e começar <ArrowRight style={{ width: 15, height: 15 }} />
                </Link>
                <Link to="/download" className="btn btn-outline btn-lg">
                  <Download style={{ width: 15, height: 15 }} /> Baixar o app
                </Link>
              </div>
            </motion.div>
          </div>
        </div>

        <motion.div className="hero-mobile-point" style={{ y: pointY }}>
          <motion.div
            className="hero-mobile"
            variants={variants}
            initial="hidden"
            animate={intro ? "visible" : "hidden"}
          >
            <PhoneShowcase />
          </motion.div>
        </motion.div>

        <div className="hero-top-blur" aria-hidden="true" />
      </div>

      {/* O fundo mora FORA do miolo de 100vh de propósito: assim ele cobre
          também a cauda do hero (o `padding-bottom` que ficou no lugar da
          antiga faixa de métricas) e as estrelas descem junto com o aparelho,
          em vez de morrerem na linha do miolo. */}
      <div className="hero-video-area" aria-hidden="true" ref={videosRef}>
        <div className="hero-video-d">
          <video
            className="hero-video"
            src="/assets/video/hero-bg.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
          />
        </div>
        <div className="hero-video-p">
          <video
            className="hero-video"
            src="/assets/video/hero-bg-portrait.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="none"
          />
        </div>
        <div className="hero-video-mask" />
        <Particles />
      </div>

      <div className="hero-down-mask" aria-hidden="true" />
    </header>
  );
}

export default HeroMotion;

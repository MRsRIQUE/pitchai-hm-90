import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useInView, useScroll, useTransform } from "motion/react";
import { ArrowRight, Check, X } from "lucide-react";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * CARDS EMPILHADOS — o `a-4` da landing de referência, medido lá sobre a
 * altura da seção enquanto ela cruza a viewport:
 *
 *   34%  card 1 y 0vh     | card 2 scale .8, y 10vh, opacity .28
 *   45%                   | card 2 opacity 1
 *   65%  card 1 y -100vh  | card 2 scale 1, y 0vh
 *
 * O scrub é SÓ desktop: no mobile a referência desmonta o sticky e os dois
 * viram uma coluna comum. O corte é o do `useIsMobile` (768px) — o CSS daqui
 * usa o mesmo número, senão haveria uma faixa em que o JS empurra os cards
 * e o CSS já os havia empilhado. Quem liga o empilhamento no CSS é a classe
 * `stack--stick`, posta aqui: sem ela vale a coluna simples.
 *
 * ACABAMENTO — vem do card da referência, refeito sem os .webp dela (o
 * projeto não tem esses assets): céu estrelado e nebulosa roxa em gradientes,
 * borda de 1px acesa por um facho que gira atrás do card, e o conteúdo em
 * duas colunas — texto à esquerda, aparelho grande à direita mostrando o
 * produto. O aparelho é cortado pela base do card, como lá.
 *
 * O conteúdo é a comparação que a Pitch AI precisa fazer — a live sem ela e a
 * live com ela — porque é aqui, depois do manifesto, que o leitor decide.
 */

const SEM = [
  "Pergunta de frete some no meio de 40 mensagens",
  "O produto despina e ninguém percebe até acabar a live",
  "Silêncio enquanto você procura a próxima peça",
  "Live derrubada por uma violação que passou batido",
];

const COM = [
  "Resposta em menos de 2 segundos, com a sua ficha técnica",
  "Auto-fixar devolve a oferta ao topo no intervalo que você define",
  "Voz neural narra a promoção enquanto você troca de produto",
  "Antiviolação encerra sozinha antes de a conta ser punida",
];

/** view-item="from-center": forma 2s expo.out, opacidade .2s, one-shot. */
const fromCenter = (reduce: boolean) => ({
  hidden: { opacity: 0, scale: 0.6 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      scale: reduce
        ? { duration: 0.15 }
        : { duration: 2, ease: [0.19, 1, 0.22, 1] as [number, number, number, number] },
      opacity: { duration: reduce ? 0.15 : 0.2 },
    },
  },
});

/* ------------------------------------------------------------
   O aparelho de cada card. É a mesma live nos dois: o que muda é
   quem responde. Decorativo — a lista ao lado já diz tudo.
   ------------------------------------------------------------ */
function StackPhone({ variant }: { variant: "sem" | "com" }) {
  return (
    <div className={`stack-phone stack-phone--${variant}`} aria-hidden="true">
      <div className="stack-phone-screen">
        <div className="stack-screen-bar">
          <span className="stack-live">
            <i className="stack-dot" />
            AO VIVO
          </span>
          <span className="stack-viewers">{variant === "com" ? "2.907" : "1.284"} assistindo</span>
        </div>

        <div className="stack-stage">
          <span className="stack-stage-body" />
          <span className="stack-stage-head" />
        </div>

        {variant === "sem" ? <SemFeed /> : <ComFeed />}
      </div>
    </div>
  );
}

function SemFeed() {
  return (
    <div className="stack-feed">
      <p className="stack-msg">
        <b>@gabriel_vendas</b> vocês entregam pra SP?
      </p>
      <p className="stack-msg">
        <b>@lu.oficial</b> quanto fica o frete?
      </p>
      <p className="stack-msg">
        <b>@marcos77</b> ainda tem o kit?
      </p>
      <div className="stack-alert">
        <span className="stack-alert-n">12</span> perguntas sem resposta
      </div>
    </div>
  );
}

function ComFeed() {
  return (
    <div className="stack-feed">
      <div className="stack-answer">
        <p className="stack-answer-q">
          <b>@gabriel_vendas</b> vocês entregam pra SP?
        </p>
        <p className="stack-answer-a">
          <span className="stack-ia">IA</span>
          Sim! Envio expresso pra SP em até 24h. 🚚
        </p>
      </div>

      <div className="stack-prod">
        <span className="stack-prod-ic">🛍️</span>
        <span className="stack-prod-txt">
          <span className="stack-prod-name">Kit Promoção TikTok</span>
          <span className="stack-prod-price">R$ 29,90</span>
        </span>
        <span className="stack-prod-pin">Fixado</span>
      </div>

      <div className="stack-toast">
        <span className="stack-toast-ic">💰</span>
        <span className="stack-toast-txt">Venda confirmada · Ana</span>
        <span className="stack-toast-v">R$ 29,90</span>
      </div>
    </div>
  );
}

/* Céu, nebulosa e facho da borda: só enfeite, nenhum deles lê texto. */
function StackSky({ variant }: { variant: "sem" | "com" }) {
  return (
    <>
      <span className={`stack-sky stack-sky--${variant}`} />
      <span className="stack-stars stack-stars--far" />
      <span className="stack-stars" />
      <span className={`stack-nebula stack-nebula--${variant}`} />
    </>
  );
}

export function StackCards() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionSafe();
  const isMobile = useIsMobile();
  const scrub = !isMobile && !reduce;

  /*
   * O céu de cada card tem quatro loops (facho, duas camadas de estrela e a
   * nebulosa) e são dois cards. Longe da tela nada disso precisa girar, então
   * a classe `stack--live` é quem libera o `animation-play-state`.
   */
  const sectionRef = useRef<HTMLElement>(null);
  const near = useInView(sectionRef, { margin: "300px" });

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const firstY = useTransform(scrollYProgress, [0.34, 0.65], ["0vh", "-100vh"]);
  const secondScale = useTransform(scrollYProgress, [0.34, 0.65], [0.8, 1]);
  const secondY = useTransform(scrollYProgress, [0.34, 0.65], ["10vh", "0vh"]);
  const secondOpacity = useTransform(scrollYProgress, [0.34, 0.45], [0.28, 1]);

  /*
   * Fora do scrub é preciso escrever os valores neutros, não `undefined`: o
   * primeiro render do cliente ainda acha que é desktop (o useIsMobile só
   * resolve no effect), então o Motion já gravou `opacity: 0.28` inline.
   * Trocar para `undefined` faz o Motion parar de atualizar, mas o 0.28 fica
   * lá — e o segundo card nasceria apagado no mobile.
   *
   * Sem scrub os dois cards ficam em `y: 0`, inclusive no desktop sob
   * reduced-motion: o CSS desmonta o sticky junto (`.stack--stick` some) e
   * eles viram uma coluna. Deixar o primeiro em `-100vh`, como a referência
   * faz, escondia metade do argumento de quem pede menos movimento.
   */
  const firstStyle = scrub ? { y: firstY } : { y: 0 };
  const secondStyle = scrub
    ? { y: secondY, scale: secondScale, opacity: secondOpacity }
    : { y: 0, scale: 1, opacity: 1 };

  return (
    <section
      id="comparacao"
      className={`stack${scrub ? " stack--stick" : ""}${near ? " stack--live" : ""}`}
      ref={sectionRef}
    >
      <div className="stack-height" ref={ref}>
        <div className="stack-sticky">
          <div className="stack-wrap">
            <motion.div className="stack-card-wrapper stack-card-wrapper--s1" style={firstStyle}>
              <motion.div
                className="stack-stroke"
                variants={fromCenter(reduce)}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
              >
                {/* facho que gira atrás do card e acende a borda de 1px */}
                <span className="stack-beam-point" aria-hidden="true">
                  <span className="stack-beam" />
                </span>

                <article className="stack-card stack-card--sem">
                  <StackSky variant="sem" />

                  <div className="stack-copy">
                    <p className="stack-tag">Sem a Pitch AI</p>
                    <h2 className="stack-title">A live acontece uma vez só.</h2>
                    <ul className="stack-list stack-list--sem">
                      {SEM.map((item) => (
                        <li key={item}>
                          <X />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <span className="stack-halo" aria-hidden="true" />
                  <div className="stack-device">
                    <StackPhone variant="sem" />
                  </div>
                </article>
              </motion.div>
            </motion.div>

            <motion.div className="stack-card-wrapper stack-card-wrapper--s2" style={secondStyle}>
              <motion.div
                className="stack-stroke stack-stroke--com"
                variants={fromCenter(reduce)}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
              >
                <span className="stack-beam-point" aria-hidden="true">
                  <span className="stack-beam stack-beam--com" />
                </span>

                <article className="stack-card stack-card--com">
                  <StackSky variant="com" />

                  <div className="stack-copy">
                    <p className="stack-tag stack-tag--com">Com a Pitch AI</p>
                    <h2 className="stack-title">A live vira um time de dois.</h2>
                    <ul className="stack-list stack-list--com">
                      {COM.map((item) => (
                        <li key={item}>
                          <Check />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <Link to="/planos" className="btn btn-primary btn-lg btn-glow stack-cta">
                      Ver planos e começar <ArrowRight style={{ width: 15, height: 15 }} />
                    </Link>
                  </div>

                  <span className="stack-halo stack-halo--com" aria-hidden="true" />
                  <div className="stack-device">
                    <StackPhone variant="com" />
                  </div>
                </article>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default StackCards;

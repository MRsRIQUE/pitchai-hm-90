import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { Clock, MessageSquare, Mic, Pin, Shield, Sparkles, Volume2 } from "lucide-react";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";
import { ChatDemo, VoiceDemo } from "./FeatureDemos";

/**
 * RECURSOS — colagem sobre headline colossal.
 *
 * O layout é o `HowItWorks` da réplica traduzido para cá: uma headline gigante
 * ocupando o fundo da seção e os cards passando POR CIMA dela conforme o
 * scroll, com widgets pequenos flutuando nos vãos. Antes isto era um bento
 * chapado, em que os seis recursos pesavam quase o mesmo e nada se movia.
 *
 * O que veio da referência, e o que mudou:
 *
 *   - duas camadas por elemento, como lá. `.lpf-cell` carrega SÓ o parallax do
 *     scroll e `.lpf-view`, por dentro, SÓ a entrada from-center. Misturar as
 *     duas encolhe a caixa medida junto com a animação — é a armadilha que o
 *     `HowItWorks.jsx` documenta.
 *   - a réplica posiciona os nove blocos com `inset` em porcentagem sobre um
 *     palco de altura fixa. Aqui o palco é uma grade de 12 colunas: o conteúdo
 *     é texto real em português, de altura imprevisível, e `inset` em % faria
 *     os cards colidirem na primeira quebra de linha diferente. A grade dá o
 *     mesmo espalhamento em diagonal sem esse risco.
 *   - lá `1rem = 1vw`; aqui o rem é 16px fixo, então todas as amplitudes do
 *     parallax estão em `vw` — é o que mantém o movimento proporcional à
 *     largura, como na referência.
 *
 * As amplitudes (em vw, de p=0 a p=1 enquanto a seção cruza a viewport) são
 * escalonadas por profundidade: a headline desce devagar, os cards sobem, os
 * widgets sobem bem mais. É a diferença entre elas — ~30vw entre headline e
 * card, ~50vw entre headline e widget — que produz o "passar por cima".
 *
 * O chat e a voz continuam com demo viva: são o motivo da compra e nenhum
 * rearranjo de layout justifica trocá-las por um card de ícone.
 */

type Feature = {
  /** vira a classe da célula na grade: `lpf-cell--chat` */
  cell: string;
  icon: typeof Shield;
  title: string;
  desc: string;
  badge: string;
  hi?: boolean;
  demo?: "chat" | "voice";
  /** amplitude do parallax em vw: [p=0, p=1] */
  range: [number, number];
};

const FEATURES: Feature[] = [
  {
    cell: "chat",
    icon: MessageSquare,
    title: "Responde o chat em menos de 2 segundos",
    desc: "Frete, tamanho, prazo e garantia com base na ficha técnica que você cadastrou. Quando a pergunta sai do escopo, ela chama você em vez de arriscar.",
    badge: "Atendimento",
    demo: "chat",
    range: [5, -6],
  },
  {
    cell: "voice",
    icon: Mic,
    title: "Oito vozes neurais em português",
    desc: "Pitch, saudação e chamada de oferta narrados em tempo real na transmissão.",
    badge: "Voz",
    demo: "voice",
    range: [7, -8],
  },
  {
    cell: "shield",
    icon: Shield,
    title: "Proteção da sua conta",
    desc: "Monitora a live e encerra sozinha ao detectar risco de punição, antes que o TikTok derrube.",
    badge: "Antiviolação",
    hi: true,
    range: [6, -7],
  },
  {
    cell: "pin",
    icon: Pin,
    title: "Auto-fixar produto",
    desc: "Refixa a oferta ativa no intervalo que você definir, para ela nunca sumir do topo da tela.",
    badge: "Conversão",
    range: [8, -9],
  },
  {
    cell: "clock",
    icon: Clock,
    title: "Encerrar por tempo",
    desc: "Agende o fim da live com precisão de segundos. Ideal para quem reveza apresentadores.",
    badge: "Automação",
    range: [5, -6],
  },
  {
    cell: "sound",
    icon: Volume2,
    title: "Alerta de venda",
    desc: "Efeito sonoro a cada compra confirmada. Sobe a energia da live e cria prova social.",
    badge: "Engajamento",
    range: [7, -8],
  },
];

/** alturas das barrinhas do widget de voz, em px */
const WAVE = [11, 19, 8, 23, 14, 21, 9, 17, 12];

/**
 * `view-item="from-center"` da referência: forma em 2s expo.out e opacidade em
 * 0.2s, uma vez só. Sob reduced-motion a animação continua existindo e só é
 * encurtada — trocar a prop por `undefined` prenderia o elemento no `opacity: 0`
 * que o Motion já escreveu inline no primeiro render.
 */
const fromCenter = (reduce: boolean) => ({
  hidden: { opacity: 0, scale: 0.72 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      scale: reduce
        ? { duration: 0.15 }
        : { duration: 1.6, ease: [0.19, 1, 0.22, 1] as [number, number, number, number] },
      opacity: { duration: reduce ? 0.15 : 0.25 },
    },
  },
});

/**
 * Abaixo de 900px a colagem vira uma coluna e o parallax sai junto — é o mesmo
 * corte da referência, que desliga o `a-18` exatamente onde a seção deixa de
 * ser posicionada em absoluto. Sem desligar, o translate empilharia um card
 * sobre o outro na coluna.
 *
 * O primeiro render devolve `false`, igual ao do servidor, para não trocar o
 * HTML entre SSR e hidratação.
 */
function useStacked() {
  const [stacked, setStacked] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const sync = () => setStacked(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return stacked;
}

function Float({
  progress,
  range,
  cell,
  widget,
  disabled,
  reduce,
  children,
}: {
  progress: MotionValue<number>;
  range: [number, number];
  cell: string;
  widget?: boolean;
  disabled: boolean;
  reduce: boolean;
  children: ReactNode;
}) {
  const y = useTransform(progress, [0, 1], [`${range[0]}vw`, `${range[1]}vw`]);

  /* fora do parallax é preciso escrever o zero, não `undefined`: o primeiro
     render ainda acha que é desktop, então o Motion já gravou um translate
     inline — parar de atualizar deixaria o card deslocado para sempre. */
  return (
    <motion.div
      className={`lpf-cell lpf-cell--${cell}${widget ? " lpf-cell--widget" : ""}`}
      style={disabled ? { y: 0 } : { y }}
    >
      <motion.div
        className="lpf-view"
        variants={fromCenter(reduce)}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.25 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function FeaturesSection() {
  const stage = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionSafe();
  const stacked = useStacked();
  const disabled = reduce || stacked;

  const { scrollYProgress } = useScroll({
    target: stage,
    offset: ["start end", "end start"],
  });

  /* A headline desce enquanto tudo o mais sobe: é a diferença entre os dois
     sentidos que faz os cards atravessarem o texto — 26vw de amplitude aqui
     contra ~11vw dos cards.
     O zero cai em p≈0.35, que é onde o topo da seção encosta no topo da tela:
     é o instante em que a primeira linha precisa estar na faixa livre, inteira
     e legível. Depois dele a headline afunda na colagem. */
  const headlineY = useTransform(scrollYProgress, [0, 1], ["-9vw", "17vw"]);
  /* o anel do widget é a estrela que gira do `a-18`, presa ao mesmo scroll */
  const ringRotate = useTransform(scrollYProgress, [0, 1], ["0deg", "360deg"]);

  return (
    <section id="recursos" className="bordered lpf">
      <div className="aurora sec-aurora aurora-d" aria-hidden="true" />

      <div className="wrap">
        <div className="sec-head lpf-head rv">
          <div className="eyebrow">Recursos</div>
          <p>
            Cada função nasceu de um problema real de quem faz live: o chat que ninguém dá conta, o
            produto que despina, a voz que cansa.
          </p>
        </div>
      </div>

      <div className="lpf-stage" ref={stage}>
        <motion.h2 className="lpf-headline" style={disabled ? { y: 0 } : { y: headlineY }}>
          <span className="lpf-headline-line">Feito para as regras</span>
          <span className="lpf-headline-line">do TikTok Shop,</span>
          <span className="lpf-headline-line lpf-headline-serif">não contra elas.</span>
        </motion.h2>

        <div className="lpf-front">
          {FEATURES.map((f) => (
            <Float
              key={f.cell}
              progress={scrollYProgress}
              range={f.range}
              cell={f.cell}
              disabled={disabled}
              reduce={reduce}
            >
              <article className={`card lpf-card${f.hi ? " hi" : ""}`}>
                <div className="lpf-glow" aria-hidden="true" />
                <div className="card-ic">
                  <f.icon />
                </div>
                <div className="card-tag">{f.badge}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
                {f.demo === "chat" ? <ChatDemo /> : null}
                {f.demo === "voice" ? <VoiceDemo /> : null}
              </article>
            </Float>
          ))}

          {/* os widgets são decoração: dizem o que a IA lê, ouve e vigia, e
              existem para dar profundidade ao parallax. Somem no mobile. */}
          <Float
            progress={scrollYProgress}
            range={[13, -15]}
            cell="w1"
            widget
            disabled={disabled}
            reduce={reduce}
          >
            <div className="lpf-widget lpf-widget--topics" aria-hidden="true">
              <span>Frete</span>
              <span>Tamanho</span>
              <span>Troca</span>
              <span>Pix</span>
            </div>
          </Float>

          <Float
            progress={scrollYProgress}
            range={[10, -12]}
            cell="w2"
            widget
            disabled={disabled}
            reduce={reduce}
          >
            <div className="lpf-widget lpf-widget--wave" aria-hidden="true">
              <span className="lpf-widget-ic">
                <Mic />
              </span>
              <span className="lpf-wave">
                {WAVE.map((h, i) => (
                  <i
                    key={i}
                    className="lp-bar"
                    style={{ height: h, animationDelay: `${i * 90}ms` }}
                  />
                ))}
              </span>
            </div>
          </Float>

          <Float
            progress={scrollYProgress}
            range={[15, -17]}
            cell="w3"
            widget
            disabled={disabled}
            reduce={reduce}
          >
            <div className="lpf-widget lpf-widget--ring" aria-hidden="true">
              <motion.span
                className="lpf-ring"
                style={disabled ? { rotate: 0 } : { rotate: ringRotate }}
              />
              <Sparkles />
            </div>
          </Float>

          <Float
            progress={scrollYProgress}
            range={[11, -13]}
            cell="w4"
            widget
            disabled={disabled}
            reduce={reduce}
          >
            <div className="lpf-widget lpf-widget--live" aria-hidden="true">
              <span className="lpf-dot" />
              <span className="lpf-live-k">ao vivo</span>
              <span className="lpf-live-v">
                <Shield /> protegida
              </span>
            </div>
          </Float>
        </div>
      </div>
    </section>
  );
}

export default FeaturesSection;

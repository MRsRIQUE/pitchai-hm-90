import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock,
  Coffee,
  Download,
  MessageSquare,
  Mic,
  MousePointerClick,
  Pin,
  Plus,
  Shield,
  Timer,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import { LandingNav } from "@/components/live/LandingNav";
import { GridField } from "@/components/live/GridField";
import { PitchAiLogo } from "@/components/live/PitchAiLogo";
import { StepPhone, type StepPhoneState } from "@/components/live/StepPhone";
import { ChatDemo, VoiceDemo } from "@/components/live/FeatureDemos";
import { PITCHAI_PLANS } from "@/lib/live/plans";
import "@/styles/landing.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pitch AI — Automatize sua LIVE do TikTok Shop" },
      {
        name: "description",
        content:
          "Inteligência Artificial que vende ao vivo no TikTok Shop. Respostas automáticas no chat, voz em tempo real, auto-fixar produtos e proteção contra violações.",
      },
      {
        property: "og:title",
        content: "Pitch AI — Venda mais no TikTok Shop com IA em tempo real",
      },
      {
        property: "og:description",
        content:
          "Respostas inteligentes com IA, voz em tempo real, auto-fixar vitrine e proteção ativa contra violações.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

/**
 * Recursos em bento: as duas células grandes trazem demonstração viva, porque
 * chat e voz são o motivo da compra. As quatro menores são cards de ícone.
 */
const FEATURES: Array<{
  icon: typeof Shield;
  title: string;
  desc: string;
  badge: string;
  hi?: boolean;
  size?: "wide" | "tall";
  demo?: "chat" | "voice";
}> = [
  {
    icon: MessageSquare,
    title: "Responde o chat em menos de 2 segundos",
    desc: "Frete, tamanho, prazo e garantia com base na ficha técnica que você cadastrou. Quando a pergunta sai do escopo, ela chama você em vez de arriscar.",
    badge: "Atendimento",
    size: "wide",
    demo: "chat",
  },
  {
    icon: Mic,
    title: "Oito vozes neurais em português",
    desc: "Pitch, saudação e chamada de oferta narrados em tempo real na transmissão.",
    badge: "Voz",
    size: "tall",
    demo: "voice",
  },
  {
    icon: Shield,
    title: "Proteção da sua conta",
    desc: "Monitora a live e encerra sozinha ao detectar risco de punição, antes que o TikTok derrube.",
    badge: "Antiviolação",
    hi: true,
  },
  {
    icon: Pin,
    title: "Auto-fixar produto",
    desc: "Refixa a oferta ativa no intervalo que você definir, para ela nunca sumir do topo da tela.",
    badge: "Conversão",
  },
  {
    icon: Clock,
    title: "Encerrar por tempo",
    desc: "Agende o fim da live com precisão de segundos. Ideal para quem reveza apresentadores.",
    badge: "Automação",
  },
  {
    icon: Volume2,
    title: "Alerta de venda",
    desc: "Efeito sonoro a cada compra confirmada. Sobe a energia da live e cria prova social.",
    badge: "Engajamento",
  },
];

const PHONE_VIDEOS = Array.from(
  { length: 10 },
  (_, index) => `/videos/demo-${String(index + 1).padStart(2, "0")}.mp4`,
);

const METRICS = [
  { value: "<2s", label: "Resposta no chat", sub: "Ninguém desiste da compra esperando" },
  { value: "24/7", label: "Live sem pausa", sub: "A IA não cansa nem perde o ritmo" },
  { value: "8", label: "Vozes neurais", sub: "Escolha o tom que combina com a loja" },
  { value: "0", label: "Violações", sub: "Encerramento automático ao menor risco" },
];

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

const MARQUEE_ITEMS = [
  { icon: Zap, label: "Respostas em menos de 2s" },
  { icon: Mic, label: "Voz neural em PT-BR" },
  { icon: Pin, label: "Auto-fixar vitrine" },
  { icon: Shield, label: "Antiviolação ativa" },
  { icon: MessageSquare, label: "Chat atendido 24/7" },
  { icon: Volume2, label: "Alerta de venda" },
];

const FAQ = [
  {
    q: "O TikTok pode banir minha conta por usar automação?",
    a: "A Pitch AI não burla nem simula comportamento humano na plataforma. Ela atua sobre o que você já faz na live: responder o chat, fixar produto e narrar oferta. O módulo antiviolação monitora a transmissão e a encerra automaticamente ao identificar risco, justamente para proteger a conta.",
  },
  {
    q: "Preciso deixar o computador ligado durante a live?",
    a: "Sim. A Pitch AI roda junto com a transmissão na mesma máquina em que você está fazendo a live. Enquanto a live estiver no ar, o app precisa estar aberto.",
  },
  {
    q: "A IA pode inventar informação sobre o produto?",
    a: "Ela responde exclusivamente com base na ficha técnica que você cadastra: preço, prazo, tamanho, garantia, política de troca. Quando a pergunta sai desse escopo, ela avisa que vai chamar o vendedor em vez de arriscar uma resposta.",
  },
  {
    q: "Funciona com qualquer nicho de loja?",
    a: "Sim. O que muda é a ficha técnica dos produtos e o tom de voz escolhido. Moda, beleza, casa, eletrônicos e suplementos são os nichos mais usados hoje.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim, sem fidelidade e sem multa. O acesso continua até o fim do período já pago e você pode exportar suas configurações antes.",
  },
];

function brl(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function Marquee({ rev = false }: { rev?: boolean }) {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div className={`marquee${rev ? " marquee-rev" : ""}`} aria-hidden="true">
      <div className="marquee-track">
        {items.map((it, i) => (
          <span className="marquee-item" key={i}>
            <it.icon />
            {it.label}
            <span className="marquee-sep" />
          </span>
        ))}
      </div>
    </div>
  );
}

function Landing() {
  const [phoneVideoIndex, setPhoneVideoIndex] = useState(0);
  const [phoneVideoFailed, setPhoneVideoFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const phoneVideoRef = useRef<HTMLVideoElement>(null);
  const phoneVideoFailuresRef = useRef(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => setReduceMotion(media.matches);
    syncMotionPreference();
    media.addEventListener("change", syncMotionPreference);
    return () => media.removeEventListener("change", syncMotionPreference);
  }, []);

  useEffect(() => {
    const video = phoneVideoRef.current;
    if (!video || reduceMotion || phoneVideoFailed) return;
    void video.play().catch(() => undefined);
  }, [phoneVideoIndex, reduceMotion, phoneVideoFailed]);

  /* `ended` e `error` são props do React no próprio <video>: como a key muda a
     cada clipe, o elemento é remontado e um listener imperativo ficaria preso
     ao elemento anterior — era o que travava a playlist no fim do 2º vídeo. */
  const handlePhoneVideoEnded = () => {
    phoneVideoFailuresRef.current = 0;
    setPhoneVideoIndex((index) => (index + 1) % PHONE_VIDEOS.length);
  };

  const handlePhoneVideoError = () => {
    phoneVideoFailuresRef.current += 1;
    // um clipe faltando não pode derrubar a playlist inteira
    if (phoneVideoFailuresRef.current >= PHONE_VIDEOS.length) {
      setPhoneVideoFailed(true);
      return;
    }
    setPhoneVideoIndex((index) => (index + 1) % PHONE_VIDEOS.length);
  };

  useEffect(() => {
    const els = document.querySelectorAll(".landing .rv");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px" },
    );
    els.forEach((el, i) => {
      (el as HTMLElement).style.transitionDelay = `${Math.min(i, 4) * 45}ms`;
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".landing-progress");
    if (!bar) return;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      bar.style.width = `${max > 0 ? (doc.scrollTop / max) * 100 : 0}%`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const box = document.querySelector<HTMLElement>(".mock .chat-a");
    const el = document.querySelector<HTMLElement>(".mock .chat-a-text");
    if (!box || !el) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;
    const full = "Sim! Envio expresso pra SP em até 24h.";
    let alive = true;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    (async () => {
      while (alive) {
        el.textContent = "";
        box.classList.add("typing");
        for (let i = 1; i <= full.length && alive; i++) {
          el.textContent = full.slice(0, i);
          await sleep(26 + Math.random() * 44);
        }
        box.classList.remove("typing");
        await sleep(4200);
        if (!alive) return;
        box.classList.add("typing");
        for (let i = full.length; i > 0 && alive; i--) {
          el.textContent = full.slice(0, i);
          await sleep(9);
        }
        await sleep(900);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const num = document.querySelector<HTMLElement>(".mock .viewers");
    if (!num) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;
    let n = 1284;
    let alive = true;
    let timer = 0;
    const tick = () => {
      if (!alive) return;
      n += 1 + Math.floor(Math.random() * 3);
      num.textContent = `${n.toLocaleString("pt-BR")} assistindo`;
      num.classList.add("bump");
      window.setTimeout(() => num.classList.remove("bump"), 300);
      timer = window.setTimeout(tick, 2600 + Math.random() * 3400);
    };
    timer = window.setTimeout(tick, 3200);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="landing">
      <GridField />
      <div className="landing-progress" aria-hidden="true" />
      <LandingNav />

      {/* ============ HERO ============ */}
      <header className="hero">
        <div className="aurora aurora-a" aria-hidden="true" />
        <div className="aurora aurora-b" aria-hidden="true" />
        <div className="wrap hero-grid">
          <div>
            <div className="badge">
              <b>Novo</b>
              <span>Vozes neurais em português brasileiro</span>
            </div>

            <h1>
              <span className="title-line title-line-1">Sua live do TikTok Shop</span>
              <span className="title-line title-line-2">
                vendendo <em className="h1-serif">sozinha</em>.
              </span>
            </h1>

            <p className="lede">
              A Pitch AI fica ao lado da sua transmissão: responde o chat na hora, refixa o produto
              ativo antes que ele suma e narra as ofertas em voz alta enquanto você cuida da câmera.
            </p>

            <div className="hero-actions">
              <Link to="/planos" className="btn btn-primary btn-lg btn-glow">
                Ver planos e começar <ArrowRight style={{ width: 15, height: 15 }} />
              </Link>
              <Link to="/download" className="btn btn-outline btn-lg">
                <Download style={{ width: 15, height: 15 }} /> Baixar o app
              </Link>
            </div>
          </div>

          {/* product mock */}
          <div className="mock">
            <div className="chip chip-a">
              <span
                className="chip-ic"
                style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
              >
                <Pin />
              </span>
              <span>
                <span className="chip-k">Vitrine</span>
                <span className="chip-v">Produto refixado</span>
              </span>
            </div>
            <div className="chip chip-b">
              <span className="chip-ic" style={{ background: "#EAF7F0", color: "var(--ok)" }}>
                <Zap />
              </span>
              <span>
                <span className="chip-k">Chat</span>
                <span className="chip-v">Resposta em 1,4s</span>
              </span>
            </div>

            <div className="phone">
              <div className="screen">
                <div className="screen-top">
                  <span className="live-pill">AO VIVO</span>
                  <span className="viewers">1.284 assistindo</span>
                </div>
                <div className="stage">
                  {!phoneVideoFailed && !reduceMotion ? (
                    <video
                      ref={phoneVideoRef}
                      className="stage-video"
                      key={PHONE_VIDEOS[phoneVideoIndex]}
                      src={PHONE_VIDEOS[phoneVideoIndex]}
                      poster="/logo-nav.png"
                      autoPlay
                      muted
                      playsInline
                      loop={false}
                      preload="metadata"
                      onEnded={handlePhoneVideoEnded}
                      onError={handlePhoneVideoError}
                      aria-label={`Demonstração ${phoneVideoIndex + 1} da live no TikTok Shop`}
                    />
                  ) : null}
                  <div
                    className={`stage-fallback${phoneVideoFailed || reduceMotion ? " is-visible" : ""}`}
                    aria-hidden="true"
                  >
                    <img src="/logo-nav.png" alt="" />
                    <span>
                      {phoneVideoFailed ? "Demonstração disponível em breve" : "Pitch AI ao vivo"}
                    </span>
                  </div>
                </div>
                <div className="screen-bottom">
                  <div className="chat">
                    <div className="chat-q">
                      <b>@gabriel_vendas</b> vocês entregam pra SP?
                    </div>
                    <div className="chat-a">
                      <span className="ai-tag">IA</span>
                      <span className="chat-a-text">Sim! Envio expresso pra SP em até 24h.</span>
                      <span className="chat-caret" />
                    </div>
                  </div>
                  <div className="pcard">
                    <span className="pthumb">🛍️</span>
                    <span className="pinfo">
                      <span className="pname">Kit Promoção TikTok</span>
                      <span className="pprice">R$ 29,90</span>
                    </span>
                    <span className="ppin">Fixado</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* stats */}
        <div className="wrap stats">
          <div className="stats-grid">
            {METRICS.map((m) => (
              <div className="stat rv" key={m.label}>
                <div className="stat-n">{m.value}</div>
                <div className="stat-l">{m.label}</div>
                <div className="stat-d">{m.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <Marquee />

      {/* ============ COMO FUNCIONA ============ */}
      <section id="como" className="bordered">
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
              Sem integração, sem API, sem configurar servidor. A Pitch AI roda junto com a sua live
              e você continua no controle o tempo todo.
            </p>
          </div>

          <div className="steps rv">
            {STEPS.map((s) => (
              <div className="step" key={s.n} tabIndex={0}>
                <div className="step-body">
                  <div className="step-n">{s.n}</div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                  <div className="step-meta">
                    <s.icon /> {s.meta}
                  </div>
                </div>
                <div className="step-stage">
                  <StepPhone state={s.state} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ RECURSOS ============ */}
      <section id="recursos" className="bordered">
        <div className="aurora sec-aurora aurora-d" aria-hidden="true" />
        <div className="wrap">
          <div className="sec-head rv">
            <div className="eyebrow">Recursos</div>
            <h2>Feito para as regras do TikTok Shop, não contra elas.</h2>
            <p>
              Cada função nasceu de um problema real de quem faz live: o chat que ninguém dá conta,
              o produto que despina, a voz que cansa.
            </p>
          </div>

          <div className="feat rv">
            {FEATURES.map((f) => (
              <article
                className={`card${f.hi ? " hi" : ""}${f.size ? ` card-${f.size}` : ""}`}
                key={f.title}
              >
                <div className="card-ic">
                  <f.icon />
                </div>
                <div className="card-tag">{f.badge}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
                {f.demo === "chat" ? <ChatDemo /> : null}
                {f.demo === "voice" ? <VoiceDemo /> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PLANOS ============ */}
      <section id="planos" className="bordered">
        <div className="aurora sec-aurora aurora-e" aria-hidden="true" />
        <div className="wrap">
          <div className="sec-head rv">
            <div className="eyebrow">Planos</div>
            <h2>Escolha o ritmo da sua próxima live.</h2>
            <p>
              Todos os planos incluem respostas no chat e auto-fixar. Sem fidelidade, sem taxa por
              venda e com cancelamento quando quiser.
            </p>
          </div>

          <div className="plans rv">
            {/* Planos pagos */}
            {PITCHAI_PLANS.map((p) => {
              const per = p.months === 1 ? "/mês" : p.months === 3 ? "/trimestre" : "/ano";
              const note =
                p.months === 1
                  ? "Cobrado mensalmente"
                  : `Equivale a R$ ${brl(Math.round(p.amountCents / p.months))}/mês`;
              return (
                <div className={`plan${p.highlight ? " pop" : ""}`} key={p.priceId}>
                  {p.badge && <span className="plan-badge">{p.badge}</span>}
                  <div className="plan-name">{p.name}</div>
                  <div className="plan-desc">
                    {p.months === 12
                      ? "O melhor custo por mês para quem vive de TikTok Shop."
                      : p.months === 3
                        ? "Voz neural liberada. É aqui que a live ganha ritmo próprio."
                        : "Para começar com respostas automáticas no chat."}
                  </div>
                  <div className="plan-price">
                    <span className="cur">R$</span>
                    <span className="val">{brl(p.amountCents)}</span>
                    <span className="per">{per}</span>
                  </div>
                  <div className="plan-note">{note}</div>
                  <Link
                    to="/entrar"
                    search={{ mode: "signup", plan: p.priceId }}
                    className={`btn ${p.highlight ? "btn-dark" : "btn-outline"}`}
                  >
                    Assinar {p.name}
                  </Link>
                  {p.allowAudio ? (
                    <ul>
                      <li>
                        <Check className="check" />{" "}
                        {p.months === 12 ? "Tudo do Trimestral" : "Tudo do Mensal"}
                      </li>
                      <li>
                        <Check className="check" /> Voz e áudio em tempo real
                      </li>
                      <li>
                        <Check className="check" /> Histórico de lives e analytics
                      </li>
                      <li>
                        <Check className="check" /> Suporte prioritário
                      </li>
                    </ul>
                  ) : (
                    <ul>
                      <li>
                        <Check className="check" /> Lives sem interrupção
                      </li>
                      <li>
                        <Check className="check" /> Respostas com o nome do cliente
                      </li>
                      <li>
                        <Check className="check" /> Auto-fixar e leitura da vitrine
                      </li>
                      <li className="muted-li">
                        <X className="check" style={{ color: "var(--ink-3)" }} /> Sem narração por
                        voz
                      </li>
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ SEGURANÇA + FAQ ============ */}
      <section id="faq" className="bordered">
        <div className="aurora sec-aurora aurora-c" aria-hidden="true" />
        <div className="wrap split">
          <div className="safe-card rv">
            <div className="eyebrow">Segurança</div>
            <h3>Sua conta é o ativo. Ela vem primeiro.</h3>
            <p>
              A Pitch AI foi construída em cima das diretrizes do TikTok Shop. Quando algo foge do
              padrão, ela prefere encerrar a live a arriscar sua conta.
            </p>
            <ul className="safe-list">
              <li>
                <Check className="check" /> Monitoramento contínuo da transmissão
              </li>
              <li>
                <Check className="check" /> Encerramento automático em caso de risco
              </li>
              <li>
                <Check className="check" /> A IA só responde com dados que você cadastrou
              </li>
              <li>
                <Check className="check" /> Você pode assumir o controle a qualquer momento
              </li>
            </ul>
          </div>

          <div className="rv">
            <div className="sec-head" style={{ marginBottom: 22 }}>
              <div className="eyebrow">Dúvidas frequentes</div>
              <h2 style={{ fontSize: 30 }}>Antes de você perguntar</h2>
            </div>

            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>
                  {f.q} <Plus className="caret" />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <Marquee rev />

      {/* ============ CTA FINAL ============ */}
      <section className="bordered">
        <div className="wrap">
          <div className="cta-band rv">
            <div className="cta-glow" aria-hidden="true" />
            <h2>
              A próxima live pode ser a primeira
              <br />
              em que você só apresenta.
            </h2>
            <p>
              Instale, cadastre seus produtos e deixe a Pitch AI cuidar do chat, da vitrine e da
              narração.
            </p>
            <div className="cta-actions">
              <Link to="/app" className="btn btn-primary btn-lg btn-glow">
                Escolher meu plano
              </Link>
              <Link to="/planos" className="btn btn-outline btn-lg">
                Ver planos
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer>
        <div className="wrap">
          <div className="foot">
            <div className="foot-brand">
              <PitchAiLogo size="sm" variant="dark" />
              <p>Automação de live commerce para vendedores do TikTok Shop no Brasil.</p>
            </div>
            <div className="foot-cols">
              <div className="foot-col">
                <h4>Produto</h4>
                <Link to="/" hash="recursos">
                  Recursos
                </Link>
                <Link to="/planos">Planos</Link>
                <Link to="/quentes">Produtos quentes</Link>
                <Link to="/download">Download</Link>
              </div>
              <div className="foot-col">
                <h4>Conta</h4>
                <Link to="/entrar">Entrar</Link>
                <Link to="/app">Painel</Link>
                <Link to="/lives">Minhas lives</Link>
                <Link to="/indique">Indique e ganhe</Link>
              </div>
              <div className="foot-col">
                <h4>Suporte</h4>
                <Link to="/" hash="faq">
                  Dúvidas
                </Link>
                <a href="#">Falar com a gente</a>
                <Link to="/termos">Termos de uso</Link>
                <a href="#">Privacidade</a>
              </div>
            </div>
          </div>
          <div className="foot-bot">
            <span>© {new Date().getFullYear()} Pitch AI. Todos os direitos reservados.</span>
            <span>Feito no Brasil</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { LandingNav } from "@/components/live/LandingNav";
import { SiteFrame } from "@/components/live/SiteFrame";
import { GridField } from "@/components/live/GridField";
import { PitchAiLogo } from "@/components/live/PitchAiLogo";
import { TextLoop } from "@/components/live/TextLoop";
import { Preloader } from "@/components/live/Preloader";
import { ForceDarkTheme } from "@/components/live/ForceDarkTheme";
import { HeroMotion } from "@/components/live/HeroMotion";
import { LogoReveal } from "@/components/live/LogoReveal";
import { Manifesto } from "@/components/live/Manifesto";
import { HowSteps } from "@/components/live/HowSteps";
import { StackCards } from "@/components/live/StackCards";
import { NameSection } from "@/components/live/NameSection";
import { CtaFinal } from "@/components/live/CtaFinal";
import { FeaturesSection } from "@/components/live/FeaturesSection";
import { PlanFlame } from "@/components/live/PlanFlame";
import { Tweaks } from "@/components/live/Tweaks";
import { PITCHAI_PLANS } from "@/lib/live/plans";
import "@/styles/landing.css";
import "@/styles/landing-motion.css";
import "@/styles/landing-manifesto.css";
import "@/styles/landing-stack.css";
import "@/styles/landing-cta.css";
import "@/styles/landing-features.css";
import "@/styles/landing-how.css";

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

/* a faixa de recursos virou texto correndo numa curva (TextLoop): sem ícones,
   os rótulos entram como uma frase única separada por ponto médio */
const LOOP_ITEMS = [
  "Respostas em menos de 2s",
  "Voz neural em PT-BR",
  "Auto-fixar vitrine",
  "Antiviolação ativa",
  "Chat atendido 24/7",
  "Alerta de venda",
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

/**
 * O TextLoop desenha num viewBox de 1200 de largura e o SVG é escalado para
 * caber na tela. O fator desfaz essa escala: as medidas sobem quando a tela
 * estreita e descem quando ela alarga, então a fita sai com a mesma altura e o
 * mesmo corpo de texto em qualquer viewport.
 */
function useLoopScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const read = () => setScale(Math.min(3.2, Math.max(0.45, 1200 / (window.innerWidth || 1200))));
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return scale;
}

/** corpo de letra desejado na tela, em px */
const LOOP_TARGET_PX = 20;

function FeatureLoop() {
  const k = useLoopScale();
  const fontSize = LOOP_TARGET_PX * k;
  // as demais medidas acompanham o corpo de letra escolhido
  const r = fontSize / 25;
  return (
    <div className="loop-band">
      <TextLoop
        text={LOOP_ITEMS.join(" · ")}
        shape="wave"
        autoBand
        speed={70 * k}
        direction="forward"
        separator="✦"
        curviness={16 * r}
        fontSize={fontSize}
        fontWeight={700}
        letterSpacing={0.8 * r}
        ribbonWidth={54 * r}
        ribbonColor="var(--accent)"
        color="#ffffff"
      />
    </div>
  );
}

function Landing() {
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

  return (
    <div className="landing has-frame">
      <ForceDarkTheme />
      {/* ferramenta de edição: só monta em dev ou com `?tweaks` na URL */}
      <Tweaks />
      <Preloader />
      <GridField />
      <SiteFrame />
      <div className="landing-progress" aria-hidden="true" />
      <LandingNav />

      {/* ============ HERO ============ */}
      <HeroMotion />

      <LogoReveal />

      <Manifesto />

      <FeatureLoop />

      {/* ============ COMO FUNCIONA ============ */}
      <HowSteps />

      {/* ============ RECURSOS ============ */}
      <FeaturesSection />

      <StackCards />

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
              const card = (
                <div className={`plan${p.highlight ? " pop" : ""}${p.badge ? " has-badge" : ""}`}>
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
                  {/* /comprar cuida do resto: manda para o cadastro quem ainda
                      não tem conta e abre o checkout de quem já tem */}
                  <Link
                    to="/comprar"
                    search={{ plan: p.priceId }}
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

              /* só o plano em destaque queima: a borda em chamas é o que separa
                 ele dos outros dois na fileira. Os números do shader moram no
                 esquema de tweaks — ver components/live/PlanFlame */
              if (!p.highlight) return <div key={p.priceId}>{card}</div>;
              return <PlanFlame key={p.priceId}>{card}</PlanFlame>;
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

      {/* fecho de marca: wordmark colossal sobre o gradiente, vindo da
          landing de referência. A segunda passagem da fita de recursos ficava
          aqui e saiu: repetida logo antes do wordmark, ela empurrava o fecho
          para baixo e roubava dele a entrada limpa */}
      <NameSection />

      {/* ============ CTA FINAL ============ */}
      <CtaFinal />

      {/* ============ FOOTER ============ */}
      <footer className="foot-dark">
        {/* radial-gradient do snippet: preto no centro-alto abrindo em roxo */}
        <div className="foot-bg" aria-hidden="true" />
        <div className="wrap">
          <div className="foot">
            <div className="foot-brand">
              <PitchAiLogo size="sm" variant="white" />
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { signOut as firebaseSignOut } from "firebase/auth";
import { Check, Sparkles, Volume2, VolumeX, Lock, LogOut } from "lucide-react";
import { toast } from "sonner";
import { getFirebaseAuth } from "@/lib/firebase";
import { SitePageFrame } from "@/components/live/SitePageFrame";
import { FlameWrap } from "@/components/ui/flame-wrap";
import { useUserSubscription } from "@/hooks/useUserSubscription";
import { PITCHAI_PLANS, PLAN_FEATURES, formatBRL, monthlyEquivalent } from "@/lib/live/plans";
import { formatTokenLimit, resolvePlanQuota } from "@/lib/live/quotas";

export const Route = createFileRoute("/planos")({
  component: PlanosPage,
  head: () => ({
    meta: [
      { title: "Planos do Pitch AI — A partir de R$ 27,90" },
      {
        name: "description",
        content:
          "IA que vende ao vivo no TikTok Shop. Mensal R$ 27,90 (respostas em texto), Trimestral R$ 67,90 (com voz e áudio) ou Anual R$ 117,90 (com voz e áudio).",
      },
      { property: "og:title", content: "Planos do Pitch AI a partir de R$ 27,90" },
      {
        property: "og:description",
        content:
          "Escolha o ciclo ideal para suas lives no TikTok Shop. Planos Trimestral e Anual incluem áudio e voz em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

/* roxo da marca (#8b5cf6) no formato [r, g, b] 0-1 que o shader do FlameWrap espera */
const FLAME_COLOR: [number, number, number] = [0.545, 0.361, 0.965];

/**
 * O `.plan-price` da LP já traz o "R$" no próprio span `.cur`, então aqui sai
 * só o número. Mesma formatação do `formatBRL` do `plans.ts` — inclusive o
 * separador de milhar, senão um plano acima de mil reais apareceria como
 * "1290,00" aqui e "R$ 1.290,00" no resto do site.
 */
function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* os preços da política de voz saem dos planos, nunca de texto fixo */
const PLANO_SEM_VOZ = PITCHAI_PLANS.find((p) => !p.allowAudio);
const PLANOS_COM_VOZ = PITCHAI_PLANS.filter((p) => p.allowAudio);

function PlanosPage() {
  const { subscription: sub, isComped, userId, userEmail } = useUserSubscription();

  async function handleSignOut() {
    try {
      await firebaseSignOut(getFirebaseAuth());
      toast.info("Sessão encerrada.");
    } catch {
      toast.error("Erro ao sair.");
    }
  }

  return (
    <SitePageFrame>
      <div className="wrap">
        <header className="sec-head">
          <div className="eyebrow">Planos</div>
          <h1>
            Escolha seu plano do <em className="h1-serif">Pitch AI</em>
          </h1>
          <p>
            O plano <strong>Mensal</strong> inclui todas as respostas automáticas via chat por
            texto. Os planos <strong>Trimestral</strong> e <strong>Anual</strong> liberam a voz e
            narração de áudio da IA em tempo real!
          </p>

          {userId ? (
            <div className="site-page-meta">
              <span>
                Conectado como <strong>{userEmail}</strong>
              </span>
              <button type="button" onClick={handleSignOut} className="btn btn-outline">
                <LogOut style={{ width: 14, height: 14 }} /> Sair da conta
              </button>
            </div>
          ) : (
            <div className="site-page-meta">
              <span>
                <Link to="/entrar" search={{ next: "/planos" }}>
                  Entre na sua conta
                </Link>{" "}
                para manter seus dados e token sincronizados.
              </span>
            </div>
          )}

          {isComped && sub?.granted_until && (
            <div className="site-page-meta">
              <div className="badge" style={{ marginBottom: 0 }}>
                <b>
                  <Sparkles style={{ width: 11, height: 11 }} /> Cortesia
                </b>
                <span>
                  Acesso liberado até {new Date(sub.granted_until).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </div>
          )}
        </header>

        <div className="plans">
          {PITCHAI_PLANS.map((p) => {
            const per = p.months === 1 ? "/mês" : p.months === 3 ? "/trimestre" : "/ano";
            const quota = resolvePlanQuota(p.priceId);
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
                <div className="plan-note">
                  {p.months > 1
                    ? `Equivale a ${monthlyEquivalent(p)} por mês`
                    : "Cobrado mensalmente"}
                </div>

                <div className={`plan-audio${p.allowAudio ? "" : " is-off"}`}>
                  {p.allowAudio ? <Volume2 /> : <VolumeX />}
                  <span>
                    <strong>
                      {p.allowAudio ? "Voz e áudio liberados" : "Áudio / voz bloqueado"}
                    </strong>
                    {p.allowAudio
                      ? p.audioNote
                      : "Apenas respostas por texto. Voz da IA indisponível neste plano."}
                  </span>
                </div>

                <Link
                  to="/comprar"
                  search={{ plan: p.priceId }}
                  className={`btn ${p.highlight ? "btn-dark" : "btn-outline"}`}
                >
                  Assinar Plano {p.name}
                </Link>

                <ul>
                  <li>
                    <Check className="check" /> Pitch automático de produtos
                  </li>
                  <li>
                    <Check className="check" /> Até {formatTokenLimit(quota.monthlyTokenLimit)} de
                    tokens por mês
                  </li>
                  <li>
                    <Check className="check" /> Auto-fixar ofertas na vitrine
                  </li>
                  {p.allowAudio ? (
                    <li>
                      <Check className="check" /> Voz da IA em tempo real
                    </li>
                  ) : (
                    <li className="muted-li">
                      <Lock className="check" style={{ color: "var(--ink-3)" }} /> Voz da IA em
                      tempo real
                    </li>
                  )}
                </ul>
              </div>
            );

            /* só o plano em destaque queima, exatamente como na home */
            if (!p.highlight) return <div key={p.priceId}>{card}</div>;
            return (
              <FlameWrap
                key={p.priceId}
                className="plan-flame"
                capture={false}
                color={FLAME_COLOR}
                radius={16}
                height={150}
                spread={12}
                intensity={0.7}
                speed={0.3}
                scale={0.8}
                sparks={1.4}
                sparkSize={0.3}
                rim={2.2}
                melt={3}
                distortion={7}
                smoke={1}
                ember={1.6}
              >
                {card}
              </FlameWrap>
            );
          })}
        </div>

        <section className="site-page-more split">
          <div className="safe-card">
            <div className="eyebrow">Benefícios</div>
            <h3>Incluído em todos os planos</h3>
            <ul className="safe-list">
              {PLAN_FEATURES.map((f) => (
                <li key={f}>
                  <Check className="check" /> {f}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="sec-head" style={{ marginBottom: 22 }}>
              <div className="eyebrow">Voz e áudio</div>
              <h2 style={{ fontSize: 30 }}>Política da voz da IA</h2>
              <p>
                Para garantir uma experiência de live com narração de voz ao vivo de alta
                fidelidade:
              </p>
            </div>

            <div className="site-page-stack">
              {PLANO_SEM_VOZ && (
                <article className="card">
                  <h3>
                    🔒 Plano {PLANO_SEM_VOZ.name} ({formatBRL(PLANO_SEM_VOZ.amountCents)})
                  </h3>
                  <p>
                    Sem voz/áudio. O assistente funciona respondendo aos comentários no chat apenas
                    via texto.
                  </p>
                </article>
              )}
              {PLANOS_COM_VOZ.length > 0 && (
                <article className="card hi">
                  <h3>
                    🎙️ Planos{" "}
                    {PLANOS_COM_VOZ.map((p) => `${p.name} (${formatBRL(p.amountCents)})`).join(
                      " e ",
                    )}
                  </h3>
                  <p>
                    Com áudio completo. A IA narra os pitches, ofertas e saudações em voz humana em
                    tempo real na sua live.
                  </p>
                </article>
              )}
            </div>
          </div>
        </section>
      </div>
    </SitePageFrame>
  );
}

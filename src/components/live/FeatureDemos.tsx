import { useEffect, useState } from "react";

/* ============================================================
   Demos vivas da seção de recursos.

   Em vez de ilustrar o recurso com um print parado, o card mostra
   o produto acontecendo: perguntas novas entram no chat, a IA
   demora um instante e responde; a voz troca e a frase narrada
   troca junto. Tudo congela em prefers-reduced-motion.
   ============================================================ */

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/* ---------- chat que se responde sozinho ---------- */

const CHAT_POOL = [
  { user: "@gabriel_vendas", q: "vocês entregam pra SP?", a: "Sim! Expresso em até 24h 🚚" },
  { user: "@paula.looks", q: "tem no tamanho M?", a: "Tem sim, M e G disponíveis ✨" },
  { user: "@dudastore", q: "qual o prazo de troca?", a: "7 dias corridos após receber." },
  { user: "@ju.oliveira", q: "o frete sai quanto?", a: "Grátis acima de R$ 199 no Sudeste." },
  { user: "@marcos.shop", q: "tem garantia?", a: "90 dias direto com a loja ✅" },
  { user: "@bia.store", q: "aceita pix?", a: "Pix, cartão em até 12x e boleto." },
];

const VISIBLE_MESSAGES = 3;

type ChatItem = (typeof CHAT_POOL)[number] & { id: number; answered: boolean };

export function ChatDemo() {
  const reduced = useReducedMotion();
  const [items, setItems] = useState<ChatItem[]>(() =>
    CHAT_POOL.slice(0, VISIBLE_MESSAGES).map((m, i) => ({ ...m, id: i, answered: true })),
  );

  useEffect(() => {
    if (reduced) return;
    let cursor = VISIBLE_MESSAGES;
    let answerTimer = 0;

    const push = () => {
      const id = cursor;
      const msg = CHAT_POOL[cursor % CHAT_POOL.length];
      cursor += 1;
      setItems((prev) => [...prev.slice(1), { ...msg, id, answered: false }]);
      // a IA "pensa" antes de responder — é o que dá a sensação de tempo real
      answerTimer = window.setTimeout(() => {
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, answered: true } : it)));
      }, 950);
    };

    const interval = window.setInterval(push, 3400);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(answerTimer);
    };
  }, [reduced]);

  return (
    <div className="demo demo-chat">
      {items.map((m) => (
        <div className="demo-msg" key={m.id}>
          <p className="demo-q">
            <b>{m.user}</b> {m.q}
          </p>
          <p className="demo-a">
            <span className="demo-ia">IA</span>
            {m.answered ? (
              <>
                <span className="demo-a-text">{m.a}</span>
                <span className="demo-time">1,4s</span>
              </>
            ) : (
              <span className="demo-typing" aria-label="A IA está respondendo">
                <i />
                <i />
                <i />
              </span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ---------- voz narrando ---------- */

const VOICES = [
  { name: "Bia", line: "Chegou o Kit Promoção por R$ 29,90, gente!" },
  { name: "Léo", line: "Últimas 12 unidades, corre que acaba." },
  { name: "Duda", line: "Frete grátis acima de R$ 199 no Sudeste." },
  { name: "Rafa", line: "Fixei o produto aí em cima pra vocês." },
];

const BARS = [12, 20, 9, 24, 15, 28, 11, 19, 8, 22, 14, 10, 18];

export function VoiceDemo() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const interval = window.setInterval(() => {
      setActive((i) => (i + 1) % VOICES.length);
    }, 3200);
    return () => window.clearInterval(interval);
  }, [reduced]);

  const voice = VOICES[active];

  return (
    <div className="demo demo-voice">
      <div className="demo-wave">
        <span className="demo-ia demo-ia-lg">IA</span>
        <span className="demo-bars" aria-hidden="true">
          {BARS.map((h, i) => (
            <span key={i} className="lp-bar" style={{ height: h, animationDelay: `${i * 85}ms` }} />
          ))}
        </span>
      </div>

      {/* a frase troca junto com a voz — key força a reentrada do texto */}
      <p className="demo-line" key={voice.name}>
        “{voice.line}”
      </p>

      <div className="demo-voices">
        {VOICES.map((v, i) => (
          <span key={v.name} className={`demo-voice-chip${i === active ? " is-active" : ""}`}>
            {v.name}
          </span>
        ))}
        <span className="demo-voice-chip demo-voice-more">+4</span>
      </div>
    </div>
  );
}

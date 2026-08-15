/* ============================================================
   StepPhone — a tela do app em cada passo do "como funciona".

   O aparelho fica ancorado na base do card e sobe quando o card
   recebe hover (regra `.step:hover .step-phone` em landing.css).

   As cores da UI interna são literais, não tokens: é a interface
   do TikTok dentro da ilustração, e ela não muda com o tema.
   ============================================================ */

import { Check } from "lucide-react";

export type StepPhoneState = "setup" | "live" | "selling";

export function StepPhone({ state }: { state: StepPhoneState }) {
  return (
    <div className="step-phone" aria-hidden="true">
      <div className="step-phone-shell">
        <div className="step-phone-screen">
          {state === "setup" ? <SetupState /> : null}
          {state === "live" ? <LiveState /> : null}
          {state === "selling" ? <SellingState /> : null}
        </div>
      </div>
    </div>
  );
}

/* ---------- 1. cadastro da vitrine ---------- */
function SetupState() {
  const rows = [
    { emoji: "🛍️", name: "Kit Promoção TikTok", price: "R$ 29,90", done: true },
    { emoji: "👗", name: "Combo Verão", price: "R$ 89,90", done: true },
    { emoji: "🎁", name: "Caixa Surpresa", price: "R$ 149,00", done: false },
  ];

  return (
    <div className="flex h-full flex-col bg-[#f7f6fb] p-3">
      <p className="mb-1 text-[13px] font-bold tracking-[-0.02em] text-[#0a0a0c]">Minha vitrine</p>
      <p className="mb-3 text-[10px] text-[#5c5c68]">3 produtos cadastrados</p>

      <div className="grid gap-2">
        {rows.map((r) => (
          <div
            key={r.name}
            className="flex items-center gap-2.5 rounded-xl border border-black/[0.06] bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-[#f1f0f4] text-[14px]">
              {r.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10.5px] font-medium text-[#0a0a0c]">
                {r.name}
              </span>
              <span className="block text-[10px] font-bold text-[#5b21b6]">{r.price}</span>
            </span>
            {r.done ? (
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[#0b5f3d] text-[10px] text-white">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            ) : (
              <span className="h-[18px] w-[18px] flex-none rounded-full border-2 border-dashed border-black/15" />
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl bg-[#0a0a0c] py-2.5 text-center text-[11px] font-semibold text-white">
        Adicionar produto
      </div>
    </div>
  );
}

/* ---------- 2. live no ar, IA respondendo ---------- */
function LiveState() {
  return (
    <div className="flex h-full flex-col">
      <TopBar viewers="1.284 assistindo" />
      <Stage />
      <div className="grid gap-[6px] p-2.5">
        <ChatBubble user="@gabriel_vendas" question="vocês entregam pra SP?" />
        <ProductCard pinned />
      </div>
    </div>
  );
}

/* ---------- 3. venda confirmada ---------- */
function SellingState() {
  return (
    <div className="flex h-full flex-col">
      <TopBar viewers="2.907 assistindo" />

      {/* alerta de venda, logo abaixo da barra */}
      <div className="px-2.5 pb-2">
        <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-[rgba(11,95,61,0.92)] px-2.5 py-2">
          <span className="text-[13px]">💰</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold text-white">Venda confirmada</span>
            <span className="block truncate text-[9.5px] text-white/70">
              Ana · Kit Promoção TikTok
            </span>
          </span>
          <span className="flex-none text-[11px] font-bold text-white">R$ 29,90</span>
        </div>
      </div>

      <Stage compact />

      <div className="grid gap-[6px] p-2.5">
        {/* narração por voz, em barras */}
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.09] bg-[rgba(20,20,24,0.66)] px-2.5 py-2">
          <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-[#6d28d9] text-[10px] font-bold text-white">
            IA
          </span>
          <span className="flex flex-1 items-center gap-[3px]">
            {[10, 16, 7, 19, 12, 22, 9, 15, 6, 18, 11, 8].map((h, i) => (
              <span
                key={i}
                className="lp-bar w-[3px] rounded-full bg-white/60"
                style={{ height: h, animationDelay: `${i * 90}ms` }}
              />
            ))}
          </span>
          <span className="flex-none text-[9px] text-white/55">narrando</span>
        </div>
        <ProductCard pinned />
      </div>
    </div>
  );
}

/* ---------- peças compartilhadas ---------- */

function TopBar({ viewers }: { viewers: string }) {
  return (
    <div className="flex flex-none items-center justify-between px-2.5 pb-2 pt-2.5">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#e8353f] px-2 py-1 text-[9.5px] font-semibold tracking-[0.04em] text-white">
        <span className="lp-blink h-[5px] w-[5px] rounded-full bg-white" />
        AO VIVO
      </span>
      <span className="rounded-md bg-white/15 px-2 py-1 text-[9.5px] font-medium text-white">
        {viewers}
      </span>
    </div>
  );
}

/* O palco tem altura fixa: a parte de baixo do aparelho fica cortada pelo
   card, então chat e vitrine precisam caber na faixa visível de cima. */
function Stage({ compact }: { compact?: boolean }) {
  return (
    <div
      className={`relative flex-none overflow-hidden bg-[radial-gradient(120%_90%_at_30%_20%,#2A2A33_0%,#17171C_60%,#101014_100%)] ${
        compact ? "h-[76px]" : "h-[100px]"
      }`}
    >
      <div className="absolute bottom-0 left-1/2 h-[62%] w-[58%] -translate-x-1/2 rounded-t-[120px] bg-gradient-to-b from-white/[0.09] to-white/[0.02]">
        <div className="absolute -top-[26px] left-1/2 h-[38px] w-[38px] -translate-x-1/2 rounded-full bg-white/[0.11]" />
      </div>
    </div>
  );
}

function ChatBubble({ user, question }: { user: string; question: string }) {
  return (
    <div className="rounded-xl border border-white/[0.09] bg-[rgba(20,20,24,0.66)] px-2.5 py-2 backdrop-blur">
      <p className="text-[10px] leading-[1.45] text-white/60">
        <b className="font-semibold text-white/90">{user}</b> {question}
      </p>
      <p className="mt-1.5 flex gap-1.5 border-t border-white/[0.09] pt-1.5 text-[10px] leading-[1.45] text-white">
        <span className="h-fit flex-none rounded bg-[#6d28d9] px-[5px] py-[2px] text-[8px] font-semibold">
          IA
        </span>
        Sim! Envio expresso pra SP em até 24h. 🚚
      </p>
    </div>
  );
}

function ProductCard({ pinned }: { pinned?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2">
      <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-[#f1f0f4] text-[13px]">
        🛍️
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10.5px] font-medium text-[#0a0a0c]">
          Kit Promoção TikTok
        </span>
        <span className="block text-[11px] font-bold tracking-[-0.02em] text-[#5b21b6]">
          R$ 29,90
        </span>
      </span>
      {pinned ? (
        <span className="flex-none rounded-md bg-[#f0e9fe] px-[6px] py-1 text-[9px] font-semibold text-[#5b21b6]">
          Fixado
        </span>
      ) : null}
    </div>
  );
}

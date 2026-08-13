import { useEffect, useState } from "react";
import { Shield, Zap, ShoppingBag, Brain, Volume2, Video } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { id: "sec-studio", label: "Live", Icon: Video },
  { id: "sec-protecao", label: "Proteção", Icon: Shield },
  { id: "sec-chaves", label: "Chaves", Icon: Zap },
  { id: "sec-produtos", label: "Produtos", Icon: ShoppingBag },
  { id: "sec-contexto", label: "IA", Icon: Brain },
  { id: "sec-voz", label: "Voz", Icon: Volume2 },
] as const;

export function MobileBottomNav() {
  const [active, setActive] = useState<string>(ITEMS[0].id);

  useEffect(() => {
    const els = ITEMS.map((it) => document.getElementById(it.id)).filter(
      (el): el is HTMLElement => !!el,
    );
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActive(visible.target.id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  };

  return (
    <nav
      aria-label="Navegação rápida"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-stretch justify-between gap-1 rounded-2xl border border-border/60 bg-background/85 p-1.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        {ITEMS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => jump(id)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-medium transition",
                isActive
                  ? "bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-[0_4px_14px_-4px_rgba(124,58,237,0.6)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.6 : 2.2} />
              <span className="leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

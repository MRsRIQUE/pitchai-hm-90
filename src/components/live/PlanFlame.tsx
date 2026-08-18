import type { ReactNode } from "react";
import { FlameWrap } from "@/components/ui/flame-wrap";
import { hexToRgb, useTweaks } from "@/lib/live/tweaks";

/**
 * Borda em chamas do plano em destaque.
 *
 * Existe separado do `index.tsx` por causa da assinatura no store de
 * tweaks: quem lê os valores re-renderiza a cada movimento de slider, e
 * aqui isso custa um componente. Na rota inteira custaria a landing.
 *
 * Sem o painel montado o store devolve exatamente os números que estão
 * escritos no esquema — que são os mesmos que estavam inline aqui antes.
 * Ao gravar um ajuste no código, o lugar é `TWEAK_GROUPS.flame`.
 */
export function PlanFlame({ children }: { children: ReactNode }) {
  const t = useTweaks();
  const n = (key: string) => Number(t[`flame-${key}`]);

  return (
    <FlameWrap
      className="plan-flame"
      /* o card precisa continuar sendo DOM: capturado para dentro do
         canvas ele sai do fluxo do grid, ganha barra de rolagem própria
         e o preço passa a tremer no shimmer do shader */
      capture={false}
      color={hexToRgb(String(t["flame-color"]))}
      intensity={n("intensity")}
      height={n("height")}
      spread={n("spread")}
      radius={n("radius")}
      speed={n("speed")}
      scale={n("scale")}
      turbulence={n("turbulence")}
      turbulenceScale={n("turbulenceScale")}
      turbulenceReach={n("turbulenceReach")}
      sparks={n("sparks")}
      sparkSize={n("sparkSize")}
      sparkDensity={n("sparkDensity")}
      sparkSpeed={n("sparkSpeed")}
      rim={n("rim")}
      melt={n("melt")}
      distortion={n("distortion")}
      smoke={n("smoke")}
      ember={n("ember")}
      scorch={n("scorch")}
    >
      {children}
    </FlameWrap>
  );
}

export default PlanFlame;

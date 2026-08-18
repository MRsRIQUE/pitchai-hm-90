import { useSyncExternalStore } from "react";

/* ============================================================
   TWEAKS — ajuste fino ao vivo das peças que precisam de olho

   Ferramenta de edição, não de produção: só monta em `vite dev` ou
   quando a URL traz `?tweaks`.

   Como um valor chega na tela:

   · controles com `css` (o padrão) viram custom property na RAIZ do
     documento — `--pv-x`, `--ctaph-w`, … — e a folha de estilo lê cada
     uma com o valor de hoje como fallback:

         transform: translate(var(--pv-x, 57.96%), …)

     Sem o painel montado nenhuma variável existe e o fallback manda:
     a landing renderiza exatamente igual. É o que torna seguro deixar
     o wiring no CSS de produção.

   · controles com `css: false` (as opções do shader do fogo) não têm
     forma em CSS. Quem os lê é o componente, pelo hook `useTweaks`.

   Quando um valor volta a ser o do código a propriedade é REMOVIDA em
   vez de reescrita: o `style` da raiz fica limpo e o que sobra ali é,
   literalmente, a lista do que ainda falta gravar no CSS.
   ============================================================ */

export type TweakValue = number | string;

export type TweakControl = {
  /** vira `--{key}` na raiz do documento */
  key: string;
  label: string;
  /** o valor que está escrito no código hoje — é para cá que "restaurar" volta */
  value: TweakValue;
  kind?: "range" | "color";
  min?: number;
  max?: number;
  step?: number;
  /** sufixo da custom property: "%", "px", "vw", "deg" */
  unit?: string;
  /** false = não vira CSS; quem lê é o componente, pelo hook */
  css?: boolean;
  hint?: string;
};

export type TweakGroup = {
  id: string;
  title: string;
  note?: string;
  /** só documentação: o seletor que consome estas variáveis */
  selector?: string;
  controls: TweakControl[];
};

/** atalho para as opções do shader: o prefixo do `key` casa com o nome da
 *  prop do FlameWrap, e é dele que o `PlanFlame` e o texto exportado saem */
function flame(
  prop: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
): TweakControl {
  return { key: `flame-${prop}`, label, value, min, max, step, css: false };
}

/* ------------------------------------------------------------
   ESQUEMA

   Os `value` daqui são cópia fiel do que está no CSS/JSX. Se um deles
   divergir, o painel abre mentindo — e "restaurar" passa a ser uma
   mudança. Ao gravar um tweak no código, atualize os dois.
   ------------------------------------------------------------ */
export const TWEAK_GROUPS: TweakGroup[] = [
  {
    id: "video",
    title: "Vídeo dentro do celular",
    selector: ".landing .phone-video-media",
    note: "A matriz leva um retângulo reto até o quadrilátero da tela inclinada. x/y encaixam, w/h esticam, a·b·c·d inclinam.",
    controls: [
      { key: "pv-x", label: "Encaixe →", value: 54.88, min: 30, max: 85, step: 0.01, unit: "%" },
      { key: "pv-y", label: "Encaixe ↓", value: -1.23, min: -12, max: 20, step: 0.01, unit: "%" },
      { key: "pv-w", label: "Largura", value: 63.2, min: 40, max: 90, step: 0.01, unit: "%" },
      { key: "pv-h", label: "Altura", value: 86.87, min: 50, max: 110, step: 0.01, unit: "%" },
      { key: "pv-a", label: "matriz a", value: 1.022, min: 0.6, max: 1.3, step: 0.0001 },
      { key: "pv-b", label: "matriz b", value: 0.507, min: -0.2, max: 0.8, step: 0.0001 },
      { key: "pv-c", label: "matriz c", value: -0.2245, min: -0.7, max: 0.3, step: 0.0001 },
      { key: "pv-d", label: "matriz d", value: 0.9734, min: 0.6, max: 1.3, step: 0.0001 },
      /* os dois cantos foram gravados encostados no teto antigo (18 e 12);
         o teto subiu para o slider voltar a ter para onde andar */
      { key: "pv-rx", label: "Canto ↔", value: 18, min: 0, max: 32, step: 0.1, unit: "%" },
      { key: "pv-ry", label: "Canto ↕", value: 9, min: 0, max: 20, step: 0.1, unit: "%" },
    ],
  },
  {
    id: "moldura",
    title: "Moldura (hero e CTA)",
    selector: ".landing .phone-video-showcase",
    note: "Posição do aparelho inteiro dentro da caixa. Vale nos dois lugares em que ele aparece.",
    controls: [
      { key: "pv-top", label: "Topo", value: 0.1, min: -8, max: 8, step: 0.01, unit: "%" },
      { key: "pv-left", label: "Esquerda", value: -0.25, min: -8, max: 8, step: 0.01, unit: "%" },
      { key: "pv-scale", label: "Escala", value: 102.45, min: 88, max: 118, step: 0.01, unit: "%" },
    ],
  },
  {
    id: "hero",
    title: "Celular no hero",
    selector: ".landing .hero-mobile",
    controls: [
      { key: "hph-top", label: "Topo", value: -9, min: -30, max: 12, step: 0.1, unit: "vw" },
      {
        key: "hph-left",
        label: "Esquerda",
        value: -15.9,
        min: -45,
        max: 15,
        step: 0.1,
        unit: "vw",
      },
      { key: "hph-w", label: "Largura", value: 28, min: 14, max: 50, step: 0.1, unit: "vw" },
    ],
  },
  {
    id: "cta",
    title: "Celular no CTA final",
    selector: ".landing .cta-final-phone",
    note: "A rotação usa a propriedade `rotate`, não `transform` — o Motion já escreve transform aqui.",
    controls: [
      {
        key: "ctaph-w",
        label: "Largura máx.",
        value: 300,
        min: 160,
        max: 560,
        step: 1,
        unit: "px",
      },
      { key: "ctaph-right", label: "Margem →", value: 4, min: -12, max: 24, step: 0.1, unit: "%" },
      {
        key: "ctaph-bottom",
        label: "Margem ↓",
        value: -6,
        min: -34,
        max: 12,
        step: 0.1,
        unit: "%",
      },
      { key: "ctaph-rot", label: "Rotação", value: 0, min: -25, max: 25, step: 0.5, unit: "deg" },
    ],
  },
  {
    id: "flame",
    title: "Fogo do plano em destaque",
    selector: "<FlameWrap> em routes/index.tsx",
    note: "Estes não são CSS: saem como props do FlameWrap. Use o botão copiar para levá-los ao código.",
    controls: [
      { key: "flame-color", label: "Cor", value: "#8b5cf6", kind: "color", css: false },
      /* O shader satura a emissão em 2 (`clamp(uIntensity, 0, 2)`); 3 é o
         valor escolhido no painel e fica registrado como está para o
         slider abrir onde foi deixado. Estava em 0.7 — chama fraca
         demais para separar o plano em destaque dos outros dois. */
      flame("intensity", "Intensidade", 3, 0, 3, 0.01),
      flame("height", "Altura", 158, 24, 420, 1),
      /* 8 é o piso do shader (`max(uSpread, 8)`) e é onde a chama abraça o
         card: acima disso o halo nasce longe da borda e a base do fogo
         começa lateralmente, fora da silhueta do plano. Estava em 12. */
      flame("spread", "Espalhamento", 8, 8, 120, 1),
      flame("radius", "Raio do canto", 16, 0, 60, 1),
      flame("speed", "Velocidade", 0.3, 0, 2, 0.01),
      flame("scale", "Detalhe", 0.8, 0.05, 1, 0.01),
      flame("turbulence", "Turbulência", 0.5, 0, 1, 0.01),
      flame("turbulenceScale", "Freq. turb.", 0.5, 0.2, 3, 0.01),
      flame("turbulenceReach", "Alcance turb.", 25, 4, 90, 1),
      flame("sparks", "Faíscas", 1.4, 0, 3, 0.01),
      flame("sparkSize", "Tam. faísca", 0.3, 0.2, 3, 0.01),
      flame("sparkDensity", "Dens. faísca", 1.19, 0.3, 2.5, 0.01),
      flame("sparkSpeed", "Vel. faísca", 1.04, 0.1, 3, 0.01),
      flame("rim", "Brilho da borda", 2.2, 0, 3, 0.01),
      flame("melt", "Derretimento", 3, 0, 20, 0.1),
      flame("distortion", "Distorção", 7, 0, 32, 0.1),
      flame("smoke", "Fumaça", 1, 0, 2, 0.01),
      flame("ember", "Brasa", 1.6, 0, 2, 0.01),
      flame("scorch", "Chamuscado", 0, 0, 2, 0.01),
    ],
  },
];

const CONTROLS = new Map<string, TweakControl>();
for (const group of TWEAK_GROUPS) {
  for (const control of group.controls) CONTROLS.set(control.key, control);
}

const DEFAULTS: Record<string, TweakValue> = {};
for (const [key, control] of CONTROLS) DEFAULTS[key] = control.value;

const STORAGE_KEY = "pitchai:tweaks";

let state: Record<string, TweakValue> = DEFAULTS;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function cssValue(control: TweakControl, value: TweakValue): string {
  return typeof value === "number" ? `${value}${control.unit ?? ""}` : String(value);
}

/** escreve na raiz só o que difere do código — o resto some do inline style */
function paint(next: Record<string, TweakValue>) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [key, control] of CONTROLS) {
    if (control.css === false) continue;
    if (next[key] === DEFAULTS[key]) root.style.removeProperty(`--${key}`);
    else root.style.setProperty(`--${key}`, cssValue(control, next[key]));
  }
}

function persist() {
  if (typeof window === "undefined") return;
  const diff: Record<string, TweakValue> = {};
  for (const key of Object.keys(state)) {
    if (state[key] !== DEFAULTS[key]) diff[key] = state[key];
  }
  try {
    if (Object.keys(diff).length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(diff));
  } catch {
    // navegação privada ou cota estourada: o painel continua funcionando na sessão
  }
}

/** lê o que ficou da sessão anterior e pinta. Só o painel chama. */
export function hydrateTweaks() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, TweakValue>;
      const next = { ...DEFAULTS };
      // chave desconhecida é lixo de uma versão anterior do esquema
      for (const key of Object.keys(saved)) if (key in DEFAULTS) next[key] = saved[key];
      state = next;
    }
  } catch {
    // json corrompido: segue com os valores do código
  }
  paint(state);
  emit();
}

export function setTweak(key: string, value: TweakValue) {
  if (!CONTROLS.has(key)) return;
  state = { ...state, [key]: value };
  paint(state);
  persist();
  emit();
}

export function resetTweaks(groupId?: string) {
  const next = { ...state };
  for (const group of TWEAK_GROUPS) {
    if (groupId && group.id !== groupId) continue;
    for (const control of group.controls) next[control.key] = control.value;
  }
  state = next;
  paint(state);
  persist();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;
/* o servidor não tem localStorage: renderiza sempre com o valor do código,
   que é o mesmo que o CSS já traz como fallback */
const getServerSnapshot = () => DEFAULTS;

export function useTweaks(): Record<string, TweakValue> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function isTweaked(key: string): boolean {
  return state[key] !== DEFAULTS[key];
}

/* ------------------------------------------------------------
   EXPORTAÇÃO — o painel é rascunho; o código é o original

   O bloco sai pronto para colar: as variáveis vão num `.landing`, de
   onde herdam para as regras que já as leem, e o fogo sai como atributos
   JSX. Só o que mudou entra.
   ------------------------------------------------------------ */
export function tweakSnippet(): string {
  const cssLines: string[] = [];
  const jsxLines: string[] = [];

  for (const group of TWEAK_GROUPS) {
    const changed = group.controls.filter((c) => state[c.key] !== DEFAULTS[c.key]);
    if (changed.length === 0) continue;

    if (group.id === "flame") {
      jsxLines.push(`/* ${group.title} — ${group.selector} */`);
      for (const control of group.controls) {
        const value = state[control.key];
        const mark = value === DEFAULTS[control.key] ? "" : "  // ajustado";
        if (control.kind === "color") {
          jsxLines.push(`color={${JSON.stringify(hexToRgb(String(value)))}}${mark}`);
        } else {
          jsxLines.push(`${control.key.replace("flame-", "")}={${value}}${mark}`);
        }
      }
      continue;
    }

    cssLines.push(`  /* ${group.title} — ${group.selector ?? ""} */`);
    for (const control of changed) {
      cssLines.push(`  --${control.key}: ${cssValue(control, state[control.key])};`);
    }
  }

  const parts: string[] = [];
  if (cssLines.length) parts.push(`.landing {\n${cssLines.join("\n")}\n}`);
  if (jsxLines.length) parts.push(jsxLines.join("\n"));
  return parts.length ? parts.join("\n\n") : "/* nada foi alterado */";
}

/** `#8b5cf6` -> `[0.545, 0.361, 0.965]`, que é o que o shader espera */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int)) return [0.545, 0.361, 0.965];
  return [
    Math.round((((int >> 16) & 255) / 255) * 1000) / 1000,
    Math.round((((int >> 8) & 255) / 255) * 1000) / 1000,
    Math.round(((int & 255) / 255) * 1000) / 1000,
  ];
}

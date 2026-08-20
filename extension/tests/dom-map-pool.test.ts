import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const domMapSource = readFileSync(fileURLToPath(new URL("../dom-map.js", import.meta.url)), "utf8");

/**
 * DOM sintético mínimo — o suficiente para o caminho do `startLive`. Não é um
 * navegador: entende só as formas de seletor que o dom-map realmente usa
 * (`*`, tag, [attr], [attr="v"], [attr^="v"], [attr*="v"] e grupos por vírgula).
 * O objetivo é exercitar a COLETA de candidatos com o markup real da live.
 */
class FakeElement {
  tagName: string;
  attrs: Record<string, string>;
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  own: string;
  width: number;
  height: number;

  constructor(tag: string, attrs: Record<string, string> = {}, own = "", size = [200, 40]) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.own = own;
    this.width = size[0];
    this.height = size[1];
  }

  add(...kids: FakeElement[]) {
    for (const k of kids) {
      k.parentElement = this;
      this.children.push(k);
    }
    return this;
  }

  get id() {
    return this.attrs.id || "";
  }
  get className() {
    return this.attrs.class || "";
  }
  get textContent(): string {
    return this.own + this.children.map((c) => c.textContent).join(" ");
  }
  get isConnected(): boolean {
    // O alias é o próprio caminhar da árvore: `n` reaponta a cada volta,
    // então não dá para usar `this` direto aqui.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let n: FakeElement | null = this;
    while (n.parentElement) n = n.parentElement;
    return n.tagName === "HTML";
  }
  get shadowRoot() {
    return null;
  }
  getRootNode() {
    return null;
  }
  getAttribute(name: string) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }
  getBoundingClientRect() {
    return { width: this.width, height: this.height, top: 0, left: 0 };
  }
  contains(el: FakeElement | null): boolean {
    let n = el;
    while (n) {
      if (n === this) return true;
      n = n.parentElement;
    }
    return false;
  }
  closest(sel: string): FakeElement | null {
    // O alias é o próprio caminhar da árvore: `n` reaponta a cada volta,
    // então não dá para usar `this` direto aqui.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let n: FakeElement | null = this;
    while (n) {
      if (matches(n, sel)) return n;
      n = n.parentElement;
    }
    return null;
  }
  descendants(): FakeElement[] {
    const out: FakeElement[] = [];
    for (const c of this.children) {
      out.push(c, ...c.descendants());
    }
    return out;
  }
  querySelectorAll(sel: string) {
    return this.descendants().filter((el) => matches(el, sel));
  }
}

function matchesSimple(el: FakeElement, part: string): boolean {
  const p = part.trim();
  if (!p) return false;
  if (p === "*") return true;
  const attr = p.match(/^\[([\w-]+)(?:([\^*$]?)=["']?([^"'\]]*)["']?)?\]$/);
  if (attr) {
    const [, name, op, value] = attr;
    const v = el.getAttribute(name);
    if (v === null) return false;
    if (!op && value === undefined) return true;
    if (op === "^") return v.startsWith(value);
    if (op === "*") return v.includes(value);
    return v === value;
  }
  return el.tagName === p.toUpperCase();
}

function matches(el: FakeElement, sel: string): boolean {
  return sel.split(",").some((part) => matchesSimple(el, part));
}

/** Monta a página do teste e devolve o dom-map já carregado sobre ela. */
function montarPagina() {
  // O botão EXATO que o dono do produto mandou, incluindo tamanho (75x24).
  const iniciarLive = new FakeElement(
    "button",
    {
      "data-tid": "m4b_button",
      class:
        "arco-btn arco-btn-primary arco-btn-size-default arco-btn-shape-square m4b-button text-body-s-medium",
      type: "button",
    },
    "",
    [75, 24],
  ).add(new FakeElement("span", {}, "Iniciar LIVE", [70, 20]));

  // O setor "studio" resolvido — contém um botão irrelevante e NÃO contém o
  // "Iniciar LIVE". É esta a situação que deixava o alvo invisível.
  const botaoIrrelevante = new FakeElement("button", { class: "arco-btn" }, "", [90, 30]).add(
    new FakeElement("span", {}, "Adicionar roteiro", [80, 20]),
  );
  const studio = new FakeElement("div", { class: "studio-panel" }).add(botaoIrrelevante);

  const body = new FakeElement("body").add(studio, iniciarLive);
  const html = new FakeElement("html").add(body);

  const document = {
    documentElement: html,
    body,
    querySelectorAll: (sel: string) => html.querySelectorAll(sel),
    evaluate: () => ({ singleNodeValue: null }),
  };

  const store: Record<string, unknown> = {};
  const chrome = {
    storage: {
      local: {
        get: (keys: string[], cb: (r: Record<string, unknown>) => void) => cb(store),
        set: (obj: Record<string, unknown>) => Object.assign(store, obj),
        remove: () => {},
      },
    },
  };

  const windowObj: Record<string, unknown> = {
    // O setor já resolvido, como o regions.js entregaria.
    PitchaiRegions: {
      get: (id: string) => (id === "studio" ? studio : null),
      resolveAll: async () => ({}),
    },
    location: { host: "shop.tiktok.com" },
  };

  const context: Record<string, unknown> = {
    window: windowObj,
    document,
    chrome,
    Element: FakeElement,
    Node: FakeElement,
    XPathResult: { FIRST_ORDERED_NODE_TYPE: 9 },
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    location: windowObj.location,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(domMapSource, context);

  return {
    dom: windowObj.PitchaiDomMap as {
      resolve: (t: string, o?: { force?: boolean }) => Promise<FakeElement | null>;
      util: { isVisible: (el: FakeElement) => boolean };
    },
    iniciarLive,
    botaoIrrelevante,
    studio,
  };
}

describe("coleta de candidatos fora do setor (alvos loose)", () => {
  it("o markup real do botão passa nos filtros, então não é ele o problema", () => {
    const { dom, iniciarLive } = montarPagina();
    // 75x24 passa no isVisible (exige >=20 de largura e >=12 de altura)
    expect(dom.util.isVisible(iniciarLive)).toBe(true);
    expect(iniciarLive.textContent).toContain("Iniciar LIVE");
  });

  it("acha o Iniciar LIVE mesmo estando FORA do setor resolvido", async () => {
    const { dom, iniciarLive, studio } = montarPagina();
    // pré-condição do caso: o setor existe, tem candidato próprio, e o alvo está fora
    expect(studio.contains(iniciarLive)).toBe(false);
    expect(studio.querySelectorAll("button, [role='button'], a").length).toBeGreaterThan(0);

    const achado = await dom.resolve("startLive");
    // Antes da correção o candidatePool voltava só o conteúdo do setor e a
    // varredura ampla nunca rodava: aqui vinha null.
    expect(achado).toBe(iniciarLive);
  });

  it("o teto do MAX_SCAN corta a varredura ampla, nunca o que veio do setor", async () => {
    const { dom, studio } = montarPagina();
    // O alvo certo está DENTRO do setor, e fora dele há muito mais elementos do
    // que o teto de 6000. Como o setor entra primeiro no pool, o corte só pode
    // atingir a parte ampla — o candidato de dentro tem de sobreviver.
    const dentro = new FakeElement(
      "button",
      { "data-tid": "m4b_button", class: "arco-btn arco-btn-primary" },
      "",
      [75, 24],
    ).add(new FakeElement("span", {}, "Iniciar LIVE", [70, 20]));
    studio.add(dentro);

    const body = studio.parentElement as FakeElement;
    const ruido: FakeElement[] = [];
    for (let i = 0; i < 7000; i += 1) {
      ruido.push(new FakeElement("a", { class: "ruido" }, `link ${i}`, [40, 20]));
    }
    body.add(...ruido);

    const achado = await dom.resolve("startLive", { force: true });
    expect(achado).toBe(dentro);
  });

  it("continua preferindo o candidato de dentro do setor quando há empate", async () => {
    const { dom, studio } = montarPagina();
    // um "Iniciar LIVE" idêntico DENTRO do setor deve ganhar do de fora,
    // porque quem está no setor leva +4 na pontuação
    const dentro = new FakeElement(
      "button",
      { "data-tid": "m4b_button", class: "arco-btn arco-btn-primary" },
      "",
      [75, 24],
    ).add(new FakeElement("span", {}, "Iniciar LIVE", [70, 20]));
    studio.add(dentro);

    const achado = await dom.resolve("startLive", { force: true });
    expect(achado).toBe(dentro);
  });
});

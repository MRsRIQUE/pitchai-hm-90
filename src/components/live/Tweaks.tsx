import { useEffect, useState } from "react";
import {
  TWEAK_GROUPS,
  hydrateTweaks,
  resetTweaks,
  setTweak,
  tweakSnippet,
  useTweaks,
  type TweakControl,
} from "@/lib/live/tweaks";
import "@/styles/tweaks.css";

/**
 * Painel de tweaks — ferramenta de edição da landing.
 *
 * Abre com `Ctrl+Shift+K` ou pela aba na lateral direita. Só existe em
 * `vite dev`; num build de produção é preciso pedir por `?tweaks` na URL,
 * o que mantém a peça disponível numa preview sem oferecê-la a quem
 * chega pela porta da frente.
 *
 * O componente não decide nada: só desenha os controles do esquema em
 * `lib/live/tweaks` e devolve o que o usuário mexeu. Ver o cabeçalho de
 * lá para entender como um valor vira pixel.
 */
export function Tweaks() {
  /* `ready` só vira true depois da montagem: no servidor o painel não
     existe, e decidir isso durante o render quebraria a hidratação */
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(TWEAK_GROUPS[0].id);
  const [copied, setCopied] = useState(false);
  const values = useTweaks();

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (!import.meta.env.DEV && !query.has("tweaks")) return undefined;

    hydrateTweaks();
    setReady(true);

    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready) return null;

  const group = TWEAK_GROUPS.find((g) => g.id === tab) ?? TWEAK_GROUPS[0];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tweakSnippet());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard bloqueado (http sem permissão): mostra no console como saída
      console.log(tweakSnippet());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  if (!open) {
    return (
      <button type="button" className="tw-tab" onClick={() => setOpen(true)}>
        tweaks
      </button>
    );
  }

  return (
    <aside className="tw-panel" aria-label="Ajustes da landing">
      <header className="tw-head">
        <span className="tw-title">tweaks</span>
        <span className="tw-hint">ctrl+shift+k</span>
        <button type="button" className="tw-x" onClick={() => setOpen(false)} aria-label="Fechar">
          ×
        </button>
      </header>

      <nav className="tw-tabs">
        {TWEAK_GROUPS.map((g) => (
          <button
            type="button"
            key={g.id}
            className={`tw-tab-btn${g.id === tab ? " is-on" : ""}`}
            onClick={() => setTab(g.id)}
          >
            {g.title}
          </button>
        ))}
      </nav>

      <div className="tw-body">
        {group.selector ? <p className="tw-sel">{group.selector}</p> : null}
        {group.note ? <p className="tw-note">{group.note}</p> : null}

        {group.controls.map((control) => (
          <Row key={control.key} control={control} value={values[control.key]} />
        ))}
      </div>

      <footer className="tw-foot">
        <button type="button" className="tw-btn" onClick={() => resetTweaks(group.id)}>
          Restaurar aba
        </button>
        <button type="button" className="tw-btn" onClick={() => resetTweaks()}>
          Tudo
        </button>
        <button type="button" className="tw-btn tw-btn--go" onClick={copy}>
          {copied ? "copiado ✓" : "Copiar p/ o código"}
        </button>
      </footer>
    </aside>
  );
}

function Row({ control, value }: { control: TweakControl; value: number | string }) {
  const changed = value !== control.value;

  if (control.kind === "color") {
    return (
      <label className={`tw-row tw-row--color${changed ? " is-changed" : ""}`}>
        <span className="tw-label">{control.label}</span>
        <input
          type="color"
          value={String(value)}
          onChange={(event) => setTweak(control.key, event.target.value)}
        />
        <span className="tw-num">{String(value)}</span>
      </label>
    );
  }

  const numeric = Number(value);
  return (
    <label className={`tw-row${changed ? " is-changed" : ""}`}>
      <span className="tw-label">{control.label}</span>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={numeric}
        onChange={(event) => setTweak(control.key, Number(event.target.value))}
      />
      {/* o campo numérico existe para os passos finos: a matriz anda de
          0.0001 em 0.0001 e o range não entrega essa precisão no mouse */}
      <input
        className="tw-num tw-num--input"
        type="number"
        min={control.min}
        max={control.max}
        step={control.step}
        value={numeric}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) setTweak(control.key, next);
        }}
      />
      <span className="tw-unit">{control.unit ?? ""}</span>
    </label>
  );
}

export default Tweaks;

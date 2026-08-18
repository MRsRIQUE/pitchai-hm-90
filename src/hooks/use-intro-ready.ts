import { useEffect, useState } from "react";

/** evento disparado pelo Preloader quando ele começa a sair de cena */
export const PRELOADER_DONE_EVENT = "pitchai:preloader-done";

/**
 * `true` quando o hero pode animar: o preloader já saiu, ou nunca existiu.
 *
 * Sem isso a entrada do hero roda ESCONDIDA atrás do preloader — o
 * IntersectionObserver do `whileInView` enxerga a viewport, não a cobertura, e
 * o SplitReveal termina os 1,5s dele antes de a tela abrir. O usuário só via o
 * resultado final.
 *
 * O primeiro render devolve `false` nos dois lados (servidor e cliente), então
 * a hidratação casa; a decisão real entra no effect seguinte.
 */
export function useIntroReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const w = window as unknown as {
      __pitchaiPreloaderSkip?: boolean;
      __pitchaiPreloaderDone?: boolean;
    };

    if (w.__pitchaiPreloaderSkip || w.__pitchaiPreloaderDone) {
      setReady(true);
      return undefined;
    }

    const liberar = () => setReady(true);
    window.addEventListener(PRELOADER_DONE_EVENT, liberar, { once: true });

    /* rede de segurança: se o preloader travar por qualquer motivo, o hero não
       pode ficar preso em `opacity: 0` para sempre */
    const escape = window.setTimeout(liberar, 6000);

    return () => {
      window.removeEventListener(PRELOADER_DONE_EVENT, liberar);
      window.clearTimeout(escape);
    };
  }, []);

  return ready;
}

export default useIntroReady;

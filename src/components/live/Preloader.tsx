import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Particles } from "./Particles";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";
import { PRELOADER_DONE_EVENT } from "@/hooks/use-intro-ready";

/**
 * Preloader da home — mecânica da landing de referência, marca da Pitch AI.
 *
 * Linha do tempo, armada no evento `load`: opaco desde o primeiro quadro ->
 * hold de HOLD_MS -> fade de FADE_S -> desmonta. A referência usa 4s de hold;
 * aqui são 2,2s porque esta é uma página de venda e não um teaser — a
 * constante está isolada para você calibrar sem mexer no resto.
 *
 * Duas coisas dependem de a decisão sair ANTES da hidratação:
 *
 * 1. O `.pa-preloader` precisa estar no HTML e opaco desde o primeiro quadro.
 *    Se só entrasse na hidratação, a página apareceria primeiro e o preloader
 *    cairia por cima depois.
 * 2. Quem deve pular não pode ver flash preto nenhum.
 *
 * Por isso a decisão é o script inline em `__root.tsx` (`PRELOADER_DECIDE`),
 * que roda na análise do HTML: quem deve pular ganha um <style> que esconde o
 * preloader na hora. Este componente só lê a decisão já tomada.
 *
 * Condição de exibição: primeira visita da sessão, reload, ou entrada externa.
 * Navegar entre rotas internas não traz o preloader de volta.
 */

const HOLD_MS = 2200;
const FADE_S = 0.8;

/** curva expo.out da referência */
const EXPO_OUT = [0.19, 1, 0.22, 1] as const;

export function Preloader() {
  const reduce = useReducedMotionSafe();
  const [skipped, setSkipped] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if ((window as unknown as { __pitchaiPreloaderSkip?: boolean }).__pitchaiPreloaderSkip) {
      setSkipped(true);
      return undefined;
    }

    document.body.style.overflow = "hidden";

    // a timeline é armada no `load`, não na hidratação
    let timer: number | undefined;
    const start = () => {
      timer = window.setTimeout(() => setVisible(false), HOLD_MS);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("load", start);
      document.body.style.overflow = "";
    };
  }, []);

  /* O aviso sai no INÍCIO do fade, não no fim: assim a entrada do hero corre
     junto com a cortina abrindo, em vez de esperar a tela ficar limpa. */
  useEffect(() => {
    if (visible) return;
    document.body.style.overflow = "";
    (window as unknown as { __pitchaiPreloaderDone?: boolean }).__pitchaiPreloaderDone = true;
    window.dispatchEvent(new Event(PRELOADER_DONE_EVENT));
  }, [visible]);

  // saída sem fade: quem pula nunca chegou a ver o preloader
  if (skipped) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="preloader"
          className="pa-preloader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.15 : FADE_S, ease: "easeInOut" }}
          aria-hidden="true"
        >
          <Particles scale={0.7} />

          <div className="pa-preloader-brand">
            <motion.span
              className="pa-preloader-mark"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={
                reduce
                  ? { duration: 0.15 }
                  : { scale: { duration: 1.4, ease: EXPO_OUT }, opacity: { duration: 0.3 } }
              }
            >
              <img src="/logo-nav.png" alt="" width={128} height={128} />
            </motion.span>

            <motion.span
              className="pa-preloader-word"
              initial={{ clipPath: "inset(0 100% -20% 0)", opacity: 0 }}
              animate={{ clipPath: "inset(0 0% -20% 0)", opacity: 1 }}
              transition={
                reduce
                  ? { duration: 0.15 }
                  : {
                      clipPath: { duration: 1.1, ease: EXPO_OUT, delay: 0.22 },
                      opacity: { duration: 0.2, delay: 0.22 },
                    }
              }
            >
              pitchai
            </motion.span>
          </div>

          <div className="pa-preloader-bar">
            <motion.i
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={
                reduce ? { duration: 0.15 } : { duration: HOLD_MS / 1000, ease: [0.4, 0, 0.2, 1] }
              }
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default Preloader;

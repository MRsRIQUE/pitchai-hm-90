import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * `useReducedMotion` do Motion lê a media query já no primeiro render do
 * cliente, mas no SSR do TanStack Start não há media query e ele vale `false`.
 * Um componente que use esse valor para decidir o JSX produz um HTML no
 * servidor e outro no cliente — e o React descarta a subárvore e refaz tudo.
 *
 * Este hook adia o valor real para depois da montagem: o primeiro render é
 * sempre `false`, igual ao do servidor, e a preferência entra no effect
 * seguinte.
 *
 * ARMADILHA: como o primeiro render vale `false`, o Motion já escreveu o
 * estado inicial inline. Trocar a prop por `undefined` depois NÃO apaga o que
 * está no DOM — o elemento fica congelado em `opacity: 0`. O certo é manter a
 * animação existindo e neutralizá-la:
 *
 *     transition={reduce ? { duration: 0 } : { duration: 1.5, ease }}
 */
export function useReducedMotionSafe(): boolean {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return mounted ? !!reduce : false;
}

export default useReducedMotionSafe;

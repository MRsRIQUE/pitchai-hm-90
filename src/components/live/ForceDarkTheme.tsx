import { useEffect } from "react";
import { useTheme } from "@/lib/use-theme";

/**
 * Trava o tema em escuro enquanto a página de marketing estiver montada.
 *
 * Não é preferência de gosto: hero, logo reveal, manifesto, cards empilhados e
 * o wordmark final foram todos calibrados sobre fundo preto — as partículas
 * são brancas, os shaders somam luz e as máscaras de vídeo desmancham para
 * `#0c0b0c`. No tema claro nada disso tem contraste, então o seletor deixou de
 * existir aqui em vez de ficar oferecendo um estado quebrado.
 *
 * O painel do produto (`/app`, `/admin`) continua com o toggle: lá é interface,
 * não é peça de marca.
 */
export function ForceDarkTheme() {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme("dark");
  }, [setTheme]);

  return null;
}

export default ForceDarkTheme;

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "pitchai-theme";

const THEME_META = {
  dark: "#0F0F1A",
  light: "#fbfbfa",
} as const;

function readStored(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return null;
}

function getSystemTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_META[theme]);
}

interface ThemeContextValue {
  theme: ThemeMode;
  isDark: boolean;
  toggle: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Tema claro/escuro compartilhado por toda a árvore (landing, páginas internas
 * e painéis).
 * O primeiro render (SSR e hidratação) é sempre "dark" para casar com o
 * servidor; o tema real é aplicado num effect pós-hidratação. A classe
 * <html class="dark|light"> é definida por um script inline no head antes
 * do primeiro paint, então não há flash de cor.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // O estado inicial é uma constante de propósito: ler `document` ou o
  // localStorage aqui faz a hidratação divergir do HTML do servidor (que não
  // tem como saber a preferência) e o React descarta a árvore.
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    setTheme(readStored() ?? getSystemTheme());
    setResolved(true);
    const syncAcrossTabs = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && (event.newValue === "dark" || event.newValue === "light")) {
        setTheme(event.newValue);
      }
    };
    window.addEventListener("storage", syncAcrossTabs);
    return () => window.removeEventListener("storage", syncAcrossTabs);
  }, []);

  useEffect(() => {
    // Até o tema real ser lido, quem manda no <html> é o script inline do head.
    // Escrever antes disso repintaria a tela de escuro e voltaria — o flash que
    // o script existe para evitar.
    if (!resolved) return;
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme, resolved]);

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === "dark", toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme deve ser usado dentro de <ThemeProvider>");
  }
  return ctx;
}

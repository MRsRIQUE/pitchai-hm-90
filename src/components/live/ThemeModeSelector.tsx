import { Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "@/lib/use-theme";

/**
 * Botão de alternância claro/escuro.
 * Auto-gerenciado (persiste em localStorage e segue o sistema por padrão),
 * mas aceita props opcionais para uso controlado.
 */
export function ThemeModeSelector({
  currentTheme,
  onThemeChange,
  tone = "dark",
}: {
  currentTheme?: string;
  onThemeChange?: (theme: string) => void;
  tone?: "light" | "dark";
}) {
  const { isDark, toggle } = useTheme();
  const dark = currentTheme ? currentTheme === "dark" : isDark;

  const handleClick = () => {
    if (onThemeChange) {
      onThemeChange(dark ? "light" : "dark");
    } else {
      toggle();
    }
  };

  const isDarkTone = tone === "dark";
  const Icon = dark ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={dark ? "Mudar para o modo claro" : "Mudar para o modo escuro"}
      title={dark ? "Modo claro" : "Modo escuro"}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors duration-200 active:scale-90 ${
        isDarkTone
          ? "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
          : "border-slate-900/10 bg-white/70 text-slate-600 hover:bg-white hover:text-slate-900"
      }`}
    >
      <span
        key={dark ? "sun" : "moon"}
        className="block animate-fade-up"
        style={{ animationDuration: "0.25s" }}
      >
        <Icon className="h-4 w-4" />
      </span>
    </button>
  );
}

export type { ThemeMode };

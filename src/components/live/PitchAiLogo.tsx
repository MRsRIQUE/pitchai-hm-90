import React from "react";

interface PitchAiLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "purple" | "white" | "dark";
  showWordmark?: boolean;
}

/**
 * Logo oficial do Pitch AI: Nota musical em formato de 'P' com botão Play interno e fundo transparente.
 */
export function PitchAiLogo({
  className = "",
  size = "md",
  variant = "purple",
  showWordmark = true,
}: PitchAiLogoProps) {
  const sizeMap = {
    sm: { icon: "h-7 w-7", text: "text-xl", gap: "gap-2" },
    md: { icon: "h-9 w-9", text: "text-2xl", gap: "gap-2.5" },
    lg: { icon: "h-12 w-12", text: "text-4xl", gap: "gap-3" },
    xl: { icon: "h-16 w-16", text: "text-5xl", gap: "gap-4" },
  };

  const currentSize = sizeMap[size];

  const textColor =
    variant === "white"
      ? "text-white"
      : "text-[#1E0836] dark:text-white";

  return (
    <div className={`inline-flex items-center ${currentSize.gap} ${className}`}>
      {/* Nova logo oficial do Pitch AI (PNG, emblema 'P' neon sobre fundo escuro) */}
      <img
        src="/logo-nav.png"
        alt="Pitch AI"
        className={`${currentSize.icon} shrink-0 object-contain transition-transform hover:scale-105`}
      />

      {showWordmark && (
        <span className={`font-sora font-extrabold tracking-tight ${currentSize.text} ${textColor} select-none`}>
          pitchai
        </span>
      )}
    </div>
  );
}

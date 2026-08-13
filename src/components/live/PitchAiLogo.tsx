import React, { useState } from "react";

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
  const [logoFailed, setLogoFailed] = useState(false);

  const textColor =
    variant === "white" ? "text-white" : variant === "purple" ? "text-[#6D28D9]" : "text-[#1E0836]";

  return (
    <div className={`inline-flex items-center ${currentSize.gap} ${className}`}>
      {/* Nova logo oficial do Pitch AI (PNG, emblema 'P' neon sobre fundo escuro) */}
      {logoFailed ? (
        <span
          className={`${currentSize.icon} flex shrink-0 items-center justify-center rounded-xl bg-[#7c3aed] font-sora text-sm font-extrabold text-white shadow-[0_8px_24px_rgba(124,58,237,0.28)]`}
          aria-hidden="true"
        >
          P
        </span>
      ) : (
        <img
          src="/logo-nav.png"
          alt="Pitch AI"
          width={64}
          height={64}
          loading="eager"
          decoding="async"
          onError={() => setLogoFailed(true)}
          className={`${currentSize.icon} shrink-0 object-contain transition-transform hover:scale-105`}
        />
      )}

      {showWordmark && (
        <span
          className={`font-sora font-extrabold tracking-tight ${currentSize.text} ${textColor} select-none`}
        >
          pitchai
        </span>
      )}
    </div>
  );
}

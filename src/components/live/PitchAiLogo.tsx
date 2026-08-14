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
          className={`${currentSize.icon} flex shrink-0 items-center justify-center overflow-hidden rounded-[30%] bg-[#7c3aed] font-sora text-sm font-extrabold text-white shadow-[0_8px_24px_rgba(124,58,237,0.28)]`}
          aria-hidden="true"
        >
          P
        </span>
      ) : (
        <span
          className={`${currentSize.icon} inline-flex shrink-0 overflow-hidden rounded-[30%] bg-[#090716] shadow-[0_6px_18px_rgba(49,17,94,0.2)] ring-1 ring-[#6D28D9]/15`}
        >
          <img
            src="/logo-nav.png"
            alt="Pitch AI"
            width={64}
            height={64}
            loading="eager"
            decoding="async"
            onError={() => setLogoFailed(true)}
            className="h-full w-full scale-[1.04] object-cover transition-transform duration-200 hover:scale-[1.09]"
          />
        </span>
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

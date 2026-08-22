import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");

describe("onboarding de mídia virtual nativa", () => {
  const sources = [
    "src/lib/live/onboarding.ts",
    "src/components/live/LiveDashboard/VoiceSettings.tsx",
    "src/components/live/LiveDashboard/sections/VozSection.tsx",
    "src/components/live/LiveDashboard/sections/passos.ts",
    "src/components/live/LiveStudioCard.tsx",
    "src/components/live/SetupWizard.tsx",
  ]
    .map(read)
    .join("\n");

  it("orienta o uso da câmera e do microfone criados pela extensão", () => {
    expect(sources).toContain("Pitch AI — Câmera Virtual");
    expect(sources).toContain("Pitch AI — Microfone Virtual");
  });

  it("não recomenda drivers ou programas externos", () => {
    expect(sources).not.toMatch(
      /VB-?Cable|BlackHole|OBS Studio|OBS Virtual Camera|obsproject|Baixar OBS/i,
    );
  });
});

import type { LiveConfig } from "./config";

export const SYNC_SCHEMA_VERSION = 2;

export const SYNC_SECTIONS = ["texts", "products", "controls", "settings"] as const;
export type SyncSection = (typeof SYNC_SECTIONS)[number];

export const SYNC_SECTION_KEYS = {
  texts: ["aiContext", "productAiSalesContexts", "ultimoRoteiro", "roteirosPorProduto"],
  products: ["produtos"],
  controls: [
    "protecaoGeral",
    "violacao",
    "autoMod",
    "respostasIA",
    "responderNoChat",
    "revisarAntesDeEnviar",
  ],
  settings: [
    "uiMode",
    "preset",
    "onboardingDone",
    "autoFixar",
    "encerrarTempo",
    "pitchBank",
    "notificacoesVenda",
    "somVenda",
    "voz",
    "vozContextos",
    "filtros",
    "selectors",
  ],
} as const satisfies Record<SyncSection, readonly (keyof LiveConfig)[]>;

const SECTION_BY_KEY = new Map<string, SyncSection>(
  SYNC_SECTIONS.flatMap((section) => SYNC_SECTION_KEYS[section].map((key) => [key, section])),
);

export function inferSyncSections(fields: Record<string, unknown>): SyncSection[] {
  return [
    ...new Set(
      Object.keys(fields)
        .map((key) => SECTION_BY_KEY.get(key))
        .filter(Boolean),
    ),
  ] as SyncSection[];
}

export function selectSyncFields(
  config: Record<string, unknown>,
  sections: readonly SyncSection[],
): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const section of sections) {
    for (const key of SYNC_SECTION_KEYS[section]) {
      if (Object.prototype.hasOwnProperty.call(config, key)) selected[key] = config[key];
    }
  }
  return selected;
}

export function invalidSyncKeys(
  fields: Record<string, unknown>,
  sections: readonly SyncSection[],
): string[] {
  const allowed = new Set<string>(sections.flatMap((section) => [...SYNC_SECTION_KEYS[section]]));
  return Object.keys(fields).filter((key) => !allowed.has(key));
}

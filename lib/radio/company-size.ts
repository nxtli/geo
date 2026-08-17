/**
 * Bedrijfsgrootte als band.
 *
 * `company_size` bestond al als vrije tekst en alleen wanneer het een hard feit
 * was ("120 medewerkers" op de over-ons-pagina). Dat is precies genoeg voor
 * betrouwbaarheid maar te weinig om op te filteren: je kunt niet sorteren op een
 * string, en bij de meeste bedrijven staat het nergens.
 *
 * Daarom deze band ernaast: een grove indeling die de research ook mag INSCHATTEN
 * (uit aantal vestigingen, teampagina, vacaturevolume, toon van de site). De band
 * draagt zijn eigen herkomst mee, dus je ziet altijd of het vastgesteld of geschat
 * is.
 *
 * Belangrijk: de band beïnvloedt de scores NIET. De Fit-rubric uit de briefing
 * belóónt schaal (component D en J), terwijl de doelgroep hier juist MKB is. Die
 * spanning lossen we op met een filter, niet door de rubric stil te verbouwen —
 * anders verandert de betekenis van de Fit Score zonder dat iemand dat besloot.
 */

export type SizeBand = "micro" | "klein" | "middel" | "groot" | "zeer_groot";

export interface SizeBandDef {
  key: SizeBand;
  label: string;
  /** Ondergrens aantal medewerkers (inclusief). */
  min: number;
  /** Bovengrens aantal medewerkers (inclusief), of null voor "en meer". */
  max: number | null;
  /** Hoe je dit van buitenaf herkent. Gaat mee in de research-prompt. */
  hint: string;
}

export const SIZE_BANDS: readonly SizeBandDef[] = [
  {
    key: "micro",
    label: "Micro (1–9)",
    min: 1,
    max: 9,
    hint: "eenmanszaak of klein team, één locatie, geen apart marketingteam",
  },
  {
    key: "klein",
    label: "Klein (10–49)",
    min: 10,
    max: 49,
    hint: "één tot enkele vestigingen, marketing vaak bij de eigenaar of één marketeer",
  },
  {
    key: "middel",
    label: "Middel (50–99)",
    min: 50,
    max: 99,
    hint: "meerdere vestigingen of een stevige operatie, eigen marketingfunctie",
  },
  {
    key: "groot",
    label: "Groot (100–249)",
    min: 100,
    max: 249,
    hint: "regionale of landelijke keten met een marketingteam",
  },
  {
    key: "zeer_groot",
    label: "Zeer groot (250+)",
    min: 250,
    max: null,
    hint: "landelijk bekend merk, groot marketingteam, eigen mediabureau",
  },
] as const;

/**
 * De MKB-doelgroep zoals afgesproken: tot en met 99 medewerkers.
 *
 * Let op: dit is strakker dan de officiële MKB-grens van 250. Bewuste keuze —
 * bij deze omvang beslist de eigenaar of één marketeer, en dat maakt het gesprek
 * korter.
 */
export const MKB_BANDS: readonly SizeBand[] = ["micro", "klein", "middel"] as const;
export const MKB_MAX_EMPLOYEES = 99;

const BY_KEY = new Map(SIZE_BANDS.map((b) => [b.key, b]));

export function sizeBandDef(key: string | null | undefined): SizeBandDef | null {
  if (!key) return null;
  return BY_KEY.get(key.trim().toLowerCase() as SizeBand) ?? null;
}

export function normalizeSizeBand(value: string | null | undefined): SizeBand | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (BY_KEY.has(raw as SizeBand)) return raw as SizeBand;

  // Tolerant voor varianten die een model kan opleveren.
  const aliases: Array<[RegExp, SizeBand]> = [
    [/^(micro|zzp|eenmans)/, "micro"],
    [/^(klein|small)/, "klein"],
    [/^(middel|midden|medium)/, "middel"],
    [/^(zeer_groot|zeergroot|enterprise|xl)/, "zeer_groot"],
    [/^(groot|large)/, "groot"],
  ];
  for (const [re, band] of aliases) {
    if (re.test(raw)) return band;
  }
  return null;
}

export function sizeBandLabel(key: string | null | undefined): string {
  return sizeBandDef(key)?.label ?? "—";
}

/** Valt deze band binnen de MKB-doelgroep (≤ 99 medewerkers)? */
export function isMkb(band: string | null | undefined): boolean {
  const normalized = normalizeSizeBand(band);
  return normalized !== null && MKB_BANDS.includes(normalized);
}

/**
 * Leid een band af uit een vastgesteld aantal medewerkers.
 * Gebruikt wanneer de research een hard getal vond — dan hoeft er niets geschat.
 */
export function bandForEmployeeCount(count: number): SizeBand | null {
  if (!Number.isFinite(count) || count < 1) return null;
  const match = SIZE_BANDS.find((b) => count >= b.min && (b.max === null || count <= b.max));
  return match?.key ?? null;
}

/**
 * Haal een aantal medewerkers uit een vrije-tekstwaarde ("circa 120 medewerkers").
 * Null als er geen getal in staat — dan wordt er niets afgeleid.
 */
export function employeeCountFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  // Pak het eerste getal, ook met punt of komma als duizendscheiding.
  const match = text.replace(/[.\s](?=\d{3}\b)/g, "").match(/\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Compacte bandlijst voor de research-prompt. */
export function sizeBandPromptList(): string {
  return SIZE_BANDS.map((b) => `- ${b.key} (${b.label}): ${b.hint}`).join("\n");
}

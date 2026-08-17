/**
 * Nederlandse provincies — voor het verzorgingsgebied van een prospect.
 *
 * Bewust het VERZORGINGSGEBIED en niet de vestigingsplaats: voor radio koop je
 * zenders in op waar het publiek zit. Een keten met het hoofdkantoor in Amsterdam
 * en winkels in Limburg is voor een regionale campagne een Limburg-prospect, niet
 * een Noord-Holland-prospect.
 *
 * De vestigingsplaats blijft apart bestaan als `city`. Dat is een hard feit van de
 * contactpagina; het verzorgingsgebied is een inschatting van de research, en
 * wordt in de UI ook als zodanig gelabeld.
 */

export interface Province {
  key: string;
  label: string;
  /** Grote plaatsen, zodat de research een stad naar een provincie kan mappen. */
  cities: string[];
}

export const PROVINCES: readonly Province[] = [
  {
    key: "drenthe",
    label: "Drenthe",
    cities: ["Assen", "Emmen", "Hoogeveen", "Meppel", "Coevorden"],
  },
  {
    key: "flevoland",
    label: "Flevoland",
    cities: ["Almere", "Lelystad", "Emmeloord", "Dronten"],
  },
  {
    key: "friesland",
    label: "Friesland",
    cities: ["Leeuwarden", "Drachten", "Sneek", "Heerenveen", "Harlingen"],
  },
  {
    key: "gelderland",
    label: "Gelderland",
    cities: ["Arnhem", "Nijmegen", "Apeldoorn", "Ede", "Zutphen", "Doetinchem", "Harderwijk"],
  },
  {
    key: "groningen",
    label: "Groningen",
    cities: ["Groningen", "Veendam", "Delfzijl", "Hoogezand", "Winschoten"],
  },
  {
    key: "limburg",
    label: "Limburg",
    cities: ["Maastricht", "Venlo", "Sittard", "Heerlen", "Roermond", "Weert"],
  },
  {
    key: "noord_brabant",
    label: "Noord-Brabant",
    cities: ["Eindhoven", "Tilburg", "Breda", "Den Bosch", "'s-Hertogenbosch", "Helmond", "Roosendaal", "Oss"],
  },
  {
    key: "noord_holland",
    label: "Noord-Holland",
    cities: ["Amsterdam", "Haarlem", "Alkmaar", "Zaandam", "Hilversum", "Hoorn", "Purmerend"],
  },
  {
    key: "overijssel",
    label: "Overijssel",
    cities: ["Zwolle", "Enschede", "Deventer", "Hengelo", "Almelo", "Kampen"],
  },
  {
    key: "utrecht",
    label: "Utrecht",
    cities: ["Utrecht", "Amersfoort", "Veenendaal", "Nieuwegein", "Zeist", "Woerden"],
  },
  {
    key: "zeeland",
    label: "Zeeland",
    cities: ["Middelburg", "Vlissingen", "Goes", "Terneuzen", "Zierikzee"],
  },
  {
    key: "zuid_holland",
    label: "Zuid-Holland",
    cities: ["Rotterdam", "Den Haag", "Leiden", "Dordrecht", "Delft", "Gouda", "Zoetermeer", "Alphen aan den Rijn"],
  },
] as const;

/** Speciale waarde: landelijk actief, dus alle provincies. */
export const NATIONWIDE = "landelijk";

const BY_KEY = new Map(PROVINCES.map((p) => [p.key, p]));
const BY_LABEL = new Map(PROVINCES.map((p) => [p.label.toLowerCase(), p]));

/** Zoek een provincie op key of label. */
export function findProvince(value: string | null | undefined): Province | null {
  if (!value) return null;
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  return (
    BY_KEY.get(needle.replace(/[\s-]+/g, "_")) ??
    BY_LABEL.get(needle) ??
    BY_LABEL.get(needle.replace(/_/g, "-")) ??
    null
  );
}

/**
 * Normaliseer één provinciewaarde naar een key, `landelijk`, of null.
 * Onbekende waarden worden geweigerd in plaats van gegokt.
 */
export function normalizeProvince(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (raw === NATIONWIDE || raw === "heel nederland" || raw === "nederland") return NATIONWIDE;
  return findProvince(raw)?.key ?? null;
}

/** Normaliseer een lijst provincies, ontdubbeld. `landelijk` slokt de rest op. */
export function normalizeProvinces(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out = new Set<string>();
  for (const value of values) {
    const key = normalizeProvince(typeof value === "string" ? value : null);
    if (key) out.add(key);
  }
  if (out.has(NATIONWIDE)) return [NATIONWIDE];
  return [...out];
}

export function provinceLabel(value: string | null | undefined): string {
  if (!value) return "—";
  if (value === NATIONWIDE) return "Landelijk";
  return findProvince(value)?.label ?? value;
}

/** Labels van een lijst provincies, leesbaar aan elkaar. */
export function provincesLabel(values: string[]): string {
  if (values.length === 0) return "—";
  if (values.includes(NATIONWIDE)) return "Landelijk";
  return values.map(provinceLabel).join(", ");
}

/**
 * Dekt dit verzorgingsgebied de gevraagde provincie?
 * Landelijk dekt alles — anders zou een filter op Limburg elke landelijke keten
 * wegfilteren, terwijl regionale radio in Limburg daar juist voor hen kan werken.
 */
export function coversProvince(coverage: string[], province: string): boolean {
  if (coverage.includes(NATIONWIDE)) return true;
  return coverage.includes(province);
}

/**
 * Grote plaatsen binnen de gekozen provincies — zoektermen om de zoekstap naar
 * de juiste regio te sturen. Zonder keuze (of bij landelijk) leeg: dan hoeft er
 * niets ingeperkt te worden.
 */
export function citiesForProvinces(keys: string[], perProvince = 4): string[] {
  const out: string[] = [];
  for (const key of normalizeProvinces(keys)) {
    if (key === NATIONWIDE) continue;
    const province = findProvince(key);
    if (province) out.push(...province.cities.slice(0, perProvince));
  }
  return [...new Set(out)];
}

/** Compacte provincielijst voor de research-prompt. */
export function provincePromptList(): string {
  return PROVINCES.map((p) => `- ${p.key} (${p.label}): o.a. ${p.cities.slice(0, 4).join(", ")}`).join(
    "\n",
  );
}

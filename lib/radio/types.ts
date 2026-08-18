/**
 * Adverteren op de Radio — Prospect Finder & Scorer: domeintypes.
 *
 * Eén bron van waarheid voor de prospect-database, de scoring-engine en de
 * research-laag. Mirror van `radio_prospects` (zie lib/radio/store/schema.ts).
 *
 * Kernprincipe: elk feitelijk veld draagt zijn eigen herkomst (`fact` /
 * `inference` / `unknown`). Er staat nooit een getal in dit model waarvan we
 * niet weten of het gevonden of geschat is.
 */

/** Herkomst van een claim. Nooit een lege gok — bij twijfel `unknown`. */
export type ClaimKind = "fact" | "inference" | "unknown";

/** Betrouwbaarheid van een gevonden feit of ingeschatte waarde. */
export type Confidence = "high" | "medium" | "low";

/** Eén bron met het feit dat eruit komt. `url` moet echt zijn opgehaald. */
export interface Evidence {
  url: string;
  title: string;
  /** Het concrete feit dat op deze pagina gevonden is. */
  fact: string;
  /** ISO-datum (YYYY-MM-DD) indien bekend, anders null. */
  date: string | null;
  confidence: Confidence;
}

/* -------------------------------------------------------------------------- */
/* Fit Score                                                                  */
/* -------------------------------------------------------------------------- */

/** De tien fit-componenten (A–J uit de briefing). */
export type FitComponentKey =
  | "b2c"
  | "geographic"
  | "marketing"
  | "scale"
  | "customer_value"
  | "growth"
  | "recruitment"
  | "campaign"
  | "awareness"
  | "budget";

/** Score op één fit-component, met onderbouwing en herkomst. */
export interface FitComponentScore {
  key: FitComponentKey;
  label: string;
  score: number;
  max: number;
  /** Korte onderbouwing van juist deze score. */
  rationale: string;
  /** Gebaseerd op gevonden feiten, een inschatting, of onbekend. */
  basis: ClaimKind;
}

/* -------------------------------------------------------------------------- */
/* Triggers (het TIMING-deel)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Soorten aanleidingen om NU te bellen. Bepaalt het basisgewicht in de
 * trigger-score (zie lib/radio/scoring/triggers.ts).
 */
export type TriggerKind =
  | "new_location"
  | "product_launch"
  | "new_campaign"
  | "hiring_surge"
  | "expansion"
  | "funding"
  | "acquisition"
  | "rebranding"
  | "anniversary"
  | "new_season"
  | "new_market"
  | "event"
  | "major_promotion"
  | "sponsorship"
  | "new_marketing_lead"
  | "strong_growth"
  | "other";

/**
 * Een concrete, gedateerde aanleiding. `source_url` is verplicht: een trigger
 * zonder bron wordt door de validatielaag geweigerd (anti-hallucinatie).
 */
export interface ProspectTrigger {
  kind: TriggerKind;
  /** Wat er gebeurt, in één regel. */
  label: string;
  /** Korte uitleg waarom dit een commerciële aanleiding is. */
  explanation: string;
  source_url: string;
  /** ISO-datum (YYYY-MM-DD) indien bekend, anders null. */
  date: string | null;
  confidence: Confidence;
  /**
   * Berekende bijdrage aan de trigger-score (0–100). Door de scoring-engine
   * gezet, niet door het model.
   */
  weight?: number;
}

/* -------------------------------------------------------------------------- */
/* Sales angle & contact                                                      */
/* -------------------------------------------------------------------------- */

/** Een concrete invalshoek voor het gesprek. Max 3 per prospect. */
export interface SalesAngle {
  /** Korte typering, bijv. "Retail", "Recruitment", "Launch", "Seizoen". */
  kind: string;
  /** De angle zelf — verwijst naar een concrete commerciële situatie. */
  angle: string;
  /** Angle strength 1–10. */
  strength: number;
}

/**
 * De functies die we willen bereiken, in prioriteitsvolgorde. Index = prioriteit
 * (0 = hoogst). Zie RECOMMENDED_ROLES in lib/radio/roles.ts.
 */
export type RecommendedRole =
  | "CMO"
  | "Marketing Director"
  | "Head of Marketing"
  | "Marketing Manager"
  | "Brand Manager"
  | "Head of Growth"
  | "Growth Manager"
  | "Managing Director / eigenaar"
  | "Recruitment / Employer Branding";

/**
 * Contactpersoon. Alle velden mogen null zijn: als er geen betrouwbare persoon
 * gevonden is, blijft dit leeg en valt de UI terug op `recommended_role`.
 * Een LinkedIn-URL komt NOOIT uit de AI — alleen uit handmatige invoer of CSV.
 */
export interface ProspectContact {
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  linkedin_url: string | null;
  /** Waar deze persoon vandaan komt (bijv. "csv-import", "handmatig"). */
  source: string | null;
  confidence: Confidence | null;
}

/** Het personalisatieblok voor de outreach. */
export interface PersonalizationContext {
  /** Belangrijkste reden voor outreach. */
  reason: string;
  /** De relevante trigger, in één regel. */
  trigger: string;
  /** Interessante bedrijfsobservatie. */
  observation: string;
  /** Aanbevolen sales angle. */
  angle: string;
  /** Aanbevolen eerste vraag. */
  opening_question: string;
}

/* -------------------------------------------------------------------------- */
/* Tier & status                                                              */
/* -------------------------------------------------------------------------- */

export type Tier = "A" | "B" | "C" | "D";

/** De statusworkflow uit §12 van de briefing. */
export type ProspectStatus =
  | "New"
  | "Researched"
  | "Tier A"
  | "Tier B"
  | "Tier C"
  | "Skip"
  | "Exported to Waalaxy"
  | "Contacted"
  | "Replied"
  | "Qualified"
  | "Meeting"
  | "Won"
  | "Lost";

export const PROSPECT_STATUSES: readonly ProspectStatus[] = [
  "New",
  "Researched",
  "Tier A",
  "Tier B",
  "Tier C",
  "Skip",
  "Exported to Waalaxy",
  "Contacted",
  "Replied",
  "Qualified",
  "Meeting",
  "Won",
  "Lost",
] as const;

/* -------------------------------------------------------------------------- */
/* Het scoreresultaat                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Volledig uitgerekend scoreresultaat. Wordt door de scoring-engine geproduceerd
 * uit de research-output — het model levert componentscores, de engine rekent.
 */
export interface ProspectScores {
  fit_score: number;
  trigger_score: number;
  priority_score: number;
  tier: Tier;
  fit_components: FitComponentScore[];
  /** Redenen die tot LOW PRIORITY / SKIP leiden. Leeg = geen knock-out. */
  knockouts: string[];
  /**
   * Onderbouwing waarom een knock-out toch niet leidt tot tier D (bijzondere
   * radio-use-case). Null = geen override.
   */
  knockout_override: string | null;
  /** Tier vóór het forceren door een knock-out. Null als er niets geforceerd is. */
  tier_before_knockout: Tier | null;
}

/* -------------------------------------------------------------------------- */
/* De prospect                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Eén bedrijf in de database. Vlakke scorevelden (fit/trigger/priority en de
 * tien componenten) worden gedenormaliseerd weggeschreven zodat er in SQL op
 * gefilterd en gesorteerd kan worden; `fit_components` blijft de bron.
 */
export interface Prospect {
  id: string;
  created_at: string;
  updated_at: string;

  /* Bedrijf ------------------------------------------------------------- */
  company_name: string;
  website: string | null;
  /** Vrije branchebeschrijving zoals gevonden. */
  industry: string | null;
  /** Segment uit de vaste, uitbreidbare lijst (lib/radio/segments.ts). */
  segment: string | null;
  description: string | null;
  /** Vestigingsplaats — hard feit van de contactpagina. */
  city: string | null;
  country: string | null;
  /**
   * Verzorgingsgebied: waar dit bedrijf klanten heeft, als provincie-keys of
   * `landelijk`. Dit is wat er voor radio uitmaakt — je koopt zenders in op waar
   * het publiek zit, niet waar het hoofdkantoor staat. Meestal een inschatting.
   */
  coverage_provinces: string[];
  /** Alleen gevuld als `fact` — nooit een geschat aantal. */
  company_size: string | null;
  /**
   * Grove grootteband (micro/klein/middel/groot/zeer_groot). Mag geschat worden,
   * anders dan `company_size` — vandaar de aparte herkomst hieronder.
   */
  size_band: string | null;
  size_band_basis: ClaimKind | null;
  /** Alleen gevuld als `fact` — nooit een geschat aantal. */
  number_of_locations: number | null;

  /* Scores -------------------------------------------------------------- */
  fit_score: number | null;
  trigger_score: number | null;
  priority_score: number | null;
  tier: Tier | null;
  fit_components: FitComponentScore[];
  knockouts: string[];
  knockout_override: string | null;

  /* Waarom interessant --------------------------------------------------- */
  /** Max 5 bullets voor de detailpagina. */
  why_interesting: string[];

  /* Triggers ------------------------------------------------------------- */
  triggers: ProspectTrigger[];
  primary_trigger: string | null;
  trigger_date: string | null;

  /* Sales angles --------------------------------------------------------- */
  sales_angles: SalesAngle[];
  primary_sales_angle: string | null;
  angle_strength: number | null;

  /* Contact -------------------------------------------------------------- */
  recommended_contact_role: RecommendedRole | null;
  contact: ProspectContact;

  /* Personalisatie ------------------------------------------------------- */
  personalization: PersonalizationContext | null;

  /* Bewijs & betrouwbaarheid --------------------------------------------- */
  evidence: Evidence[];
  /** Overall betrouwbaarheid van de research, 0–100. */
  research_confidence: number | null;
  /** Samenvattend confidence-label, afgeleid van research_confidence. */
  confidence: Confidence | null;
  date_researched: string | null;
  /** Welke provider de research deed ("claude" / "mock"). */
  research_provider: string | null;
  /** True voor duidelijk gelabelde DEMO DATA-fixtures. */
  demo: boolean;

  /* Workflow ------------------------------------------------------------- */
  status: ProspectStatus;
  notes: string | null;
}

/** Velden die bij het handmatig toevoegen of importeren meegegeven mogen worden. */
export interface ProspectInput {
  company_name: string;
  website?: string | null;
  linkedin_url?: string | null;
  contact_first_name?: string | null;
  contact_last_name?: string | null;
  contact_title?: string | null;
  city?: string | null;
  industry?: string | null;
  segment?: string | null;
  notes?: string | null;
  /** Herkomst van de contactgegevens, bijv. "csv-import". */
  contact_source?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Research-contract                                                          */
/* -------------------------------------------------------------------------- */

/** Eén opgehaalde publieke pagina, input voor de AI-analyse. */
export interface FetchedSource {
  url: string;
  title: string | null;
  /** Platte tekst, afgekapt. */
  text: string;
  /** HTTP-status waarmee de pagina kwam. */
  status: number;
}

/** Alles wat we publiek hebben kunnen ophalen over een bedrijf. */
export interface CompanyWebData {
  /** De basis-URL waar we begonnen. */
  root_url: string | null;
  sources: FetchedSource[];
  /** URL's die we probeerden maar niet konden ophalen. */
  failed_urls: string[];
}

/** Input voor de research-laag. */
export interface ResearchInput {
  company_name: string;
  website: string | null;
  /** Bekende hints die de gebruiker meegaf (branche, stad, notes). */
  hints?: {
    industry?: string | null;
    city?: string | null;
    segment?: string | null;
    notes?: string | null;
  };
  /** De opgehaalde publieke data. Leeg = niets kunnen ophalen. */
  web: CompanyWebData;
}

/**
 * Wat de AI-laag oplevert: bedrijfsprofiel, componentscores, triggers, angles
 * en bewijs. Bewust GEEN totaalscores — die rekent de engine uit.
 */
export interface ResearchResult {
  company_name: string;
  industry: string | null;
  segment: string | null;
  description: string | null;
  city: string | null;
  country: string | null;
  /**
   * Verzorgingsgebied als provincie-keys of `landelijk`. Mag een inschatting
   * zijn — het is zelden ergens letterlijk opgeschreven.
   */
  coverage_provinces: { value: string[]; basis: ClaimKind };
  /** Met herkomst: alleen overgenomen als `fact`. */
  company_size: { value: string | null; basis: ClaimKind };
  /** Grootteband; mag geschat worden, in tegenstelling tot company_size. */
  size_band: { value: string | null; basis: ClaimKind };
  number_of_locations: { value: number | null; basis: ClaimKind };
  /** Lijkt het bedrijf nog actief? Voor de knock-outcheck. */
  appears_active: { value: boolean | null; basis: ClaimKind };
  /** Bedient het bedrijf de Nederlandse markt? Voor de knock-outcheck. */
  serves_dutch_market: { value: boolean | null; basis: ClaimKind };
  /** Puur specialistisch B2B? Voor de knock-outcheck. */
  purely_specialist_b2b: { value: boolean | null; basis: ClaimKind };
  fit_components: FitComponentScore[];
  triggers: ProspectTrigger[];
  sales_angles: SalesAngle[];
  why_interesting: string[];
  recommended_contact_role: RecommendedRole | null;
  /**
   * Een contactpersoon die LETTERLIJK op een opgehaalde publieke pagina stond
   * (bijv. een team- of over-ons-pagina), met de bron erbij. Null als er niets
   * betrouwbaars is — dan valt de tool terug op `recommended_contact_role`.
   *
   * Bevat NOOIT een LinkedIn-URL: die komt uitsluitend van buiten (handmatig of
   * CSV), nooit uit de AI-laag.
   */
  contact_person: ResearchContactPerson | null;
  personalization: PersonalizationContext | null;
  evidence: Evidence[];
  /**
   * Onderbouwing waarom dit bedrijf ondanks een knock-out interessant blijft.
   * Alleen zetten bij een echte, benoembare radio-use-case.
   */
  radio_use_case_override: string | null;
}

/**
 * Contactpersoon zoals gevonden op een publieke pagina. `source_url` is
 * verplicht en moet een pagina zijn die we echt hebben opgehaald — zonder bron
 * wordt de persoon weggegooid in plaats van gegokt.
 */
export interface ResearchContactPerson {
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  source_url: string;
  confidence: Confidence;
}

/**
 * Tokengebruik van een call, voor kostenrapportage.
 *
 * De cache-velden staan er los in omdat ze anders geprijsd zijn: een cache-write
 * kost 1,25× de inputprijs, een cache-read 0,1×. Zonder die splitsing zou de
 * kostenmeter een gecachte run veel te duur inschatten.
 */
export interface ResearchUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  /** Aantal webzoekopdrachten (alleen bij discovery). */
  web_searches?: number;
}

/* -------------------------------------------------------------------------- */
/* Run-historie                                                               */
/* -------------------------------------------------------------------------- */

/** Wat voor ronde er is gedraaid. */
export type RunKind = "discovery" | "research" | "local";

/**
 * Eén uitgevoerde ronde: wat er gezocht of onderzocht is, wat het opleverde en
 * wat het kostte.
 *
 * Append-only. Een run wordt vastgelegd NA afloop, met de cijfers die de ronde
 * zelf rapporteerde — hij wordt nooit herberekend uit de huidige prospectlijst,
 * want die verandert daarna nog.
 */
export interface RunRecord {
  id: string;
  kind: RunKind;
  started_at: string;
  finished_at: string;
  /** Leesbare samenvatting van de instellingen ("Limburg · MKB · aanleiding verplicht"). */
  settings: string;
  /** Zoekrichtingen (discovery) of bedrijfsnamen (research), voor het detailoverzicht. */
  targets: string[];
  /** Nieuw toegevoegde prospects (discovery) of gescoorde prospects (research). */
  added: number;
  /** Kandidaten die al in de lijst stonden. */
  duplicates: number;
  /** Kandidaten die zijn afgewezen (website bestond niet, geen aanleiding, mislukt). */
  skipped: number;
  /** Aantal webzoekopdrachten. */
  searches: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  /** Kosten in USD, opgeteld per call — euro's worden er in de UI van gemaakt. */
  cost_usd: number;
  /** Model(len) die de ronde gebruikte. */
  model: string;
  warnings: string[];
}

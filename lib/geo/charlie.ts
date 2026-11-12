import { fieldValidators } from "./validation";
import type { GeoLeadInput } from "./types";

/**
 * Charlie: de vaste chatflow. Rol, intro, toestemmingstekst en vervolgstap
 * verschillen per afzender en staan in lib/geo/brand.ts.
 * Kept as a standalone, declarative config so the chat component stays dumb
 * and the persona/copy can be tuned without touching UI logic.
 *
 * Tone of voice: slim, vriendelijk, direct, licht enthousiast, professioneel.
 * Geen overdreven AI-hype, geen jargon zonder uitleg.
 */

export const CHARLIE = {
  name: "Charlie",
  avatarInitial: "C",
};

/** The key on GeoLeadInput each step writes to. */
export type GeoFieldKey =
  | "name"
  | "email"
  | "job_title"
  | "company_name"
  | "homepage_url"
  | "offer_description"
  | "target_audience"
  | "desired_queries"
  | "competitors";

export interface CharlieStep {
  key: GeoFieldKey;
  /** Charlie's question, shown one at a time. */
  prompt: string;
  placeholder: string;
  /** Multi-line answer field for the longer, open questions. */
  multiline?: boolean;
  optional?: boolean;
  inputType?: "text" | "email" | "url";
  /** Returns an error string, or null when valid. */
  validate?: (value: string) => string | null;
  /** Charlie's short, warm acknowledgement, optionally using the answer. */
  ack?: (value: string) => string;
}

export const CHARLIE_STEPS: CharlieStep[] = [
  {
    key: "name",
    prompt: "Wat is je naam?",
    placeholder: "Bijv. Sanne",
    validate: fieldValidators.required,
    ack: (v) => `Dank je, ${v.split(" ")[0]}.`,
  },
  {
    key: "email",
    prompt:
      "Wat is je e-mailadres? Dan stuur ik je scanrapport straks naar je toe.",
    placeholder: "jij@bedrijf.nl",
    inputType: "email",
    validate: fieldValidators.email,
    ack: (v) => `Ik stuur je rapport naar ${v}. Klopt dat niet, typ dan het juiste adres.`,
  },
  {
    key: "company_name",
    prompt: "Voor welk bedrijf of merk is de pagina die je wilt scannen?",
    placeholder: "De naam zoals klanten die kennen",
    validate: fieldValidators.required,
    ack: (v) => `Helder, ${v}.`,
  },
  {
    key: "job_title",
    prompt: "Wat is je functie binnen het bedrijf?",
    placeholder: "Bijv. oprichter, marketeer, marketingmanager",
    validate: fieldValidators.required,
    ack: () => "Duidelijk.",
  },
  {
    key: "homepage_url",
    prompt: "Welke pagina wil je laten scannen? Plak het adres van de pagina.",
    placeholder: "https://jouwbedrijf.nl",
    inputType: "url",
    validate: fieldValidators.url,
    ack: () => "Ik heb de pagina.",
  },
  {
    key: "offer_description",
    prompt: "Wat verkoop of bied je aan?",
    placeholder: "Beschrijf kort je belangrijkste producten of diensten.",
    multiline: true,
    validate: fieldValidators.required,
    ack: () =>
      "Duidelijk. Ik kijk straks of je pagina dit aanbod concreet uitlegt.",
  },
  {
    key: "target_audience",
    prompt: "Voor welke doelgroep wil je gevonden worden?",
    placeholder: "Bijv. mkb-ondernemers in de bouw, marketingmanagers bij groeiende bedrijven…",
    multiline: true,
    validate: fieldValidators.required,
    ack: () => "Genoteerd.",
  },
  {
    key: "desired_queries",
    prompt:
      "Op welke vragen, zoektermen of thema's zou je graag zichtbaar willen zijn in AI-antwoorden?",
    placeholder: "Bijv. 'beste boekhoudsoftware voor zzp', 'hoe automatiseer ik mijn offertes'…",
    multiline: true,
    validate: fieldValidators.required,
    ack: () =>
      "Genoteerd. Ik toets straks of je pagina deze vragen beantwoordt.",
  },
  {
    key: "competitors",
    prompt:
      "Welke concurrenten kom je vaak tegen? Deze vraag mag je overslaan.",
    placeholder: "Bijv. concurrent.nl, voorbeeld.com",
    multiline: true,
    optional: true,
    ack: () => "Genoteerd.",
  },
];

/** Steps Charlie shows while the scan runs (label + a short "what I'm doing"). */
export interface CharlieProcessingStep {
  label: string;
  detail: string;
}

export const CHARLIE_PROCESSING_STEPS: CharlieProcessingStep[] = [
  {
    label: "Pagina ophalen",
    detail: "Ik haal je pagina op en kijk of AI-tools erbij mogen.",
  },
  {
    label: "Content analyseren",
    detail: "Ik lees je teksten: aanbod, expertise en structuur.",
  },
  {
    label: "AI-vindbaarheid beoordelen",
    detail: "Ik beoordeel de pagina op 27 punten.",
  },
  {
    label: "Verbeterpunten formuleren",
    detail: "Ik zet de adviezen op volgorde van effect.",
  },
  {
    label: "Rapport genereren",
    detail: "Ik zet alles in jouw rapport.",
  },
];

export const CHARLIE_COPY = {
  reviewLead: "Ik heb alles. Vink hieronder het vakje aan en start de scan.",
  scanningLead: "Ik start de scan van je pagina.",
  scanningStatus: "Charlie voert je scan uit.",
  scanningSubtle: "Dit duurt één tot twee minuten. Laat dit venster open.",
  successLead:
    "Je scan is klaar. Hieronder staan de belangrijkste uitkomsten.",
  emailNote: (email: string) =>
    `Ik heb het volledige rapport ook naar ${email} gestuurd. Zie je de mail niet in je inbox? Kijk dan in je map Ongewenste e-mail.`,
  /** Blijft onder de knoppen staan, ook als de chat naar de score springt. */
  emailHint: (email: string) =>
    `Het rapport staat ook in je mail (${email}). Niet in je inbox? Kijk in je map Ongewenste e-mail.`,
  priorKnown:
    "Met dit e-mailadres is al een gratis scan gedaan. Per adres is er één gratis scan. Zal ik het rapport van die scan opnieuw naar je mailen? Typ ja. Wil je meer pagina's laten beoordelen, plan dan een demo met de knop hieronder.",
  priorResent: (email: string) => `Ik heb het rapport opnieuw gestuurd naar ${email}. Kijk ook in je map met ongewenste mail.`,
  priorResendFailed: "Het opnieuw versturen lukt nu niet. Probeer het later nog eens.",
  priorDeclined: "Prima, dan stuur ik niets.",
  priorCorrection: "Met dat adres is al een scan gedaan. Ik houd je eerdere adres aan.",
  errorFallback:
    "Er ging iets mis met de automatische scan. We hebben je aanvraag wel ontvangen en kunnen je rapport handmatig nasturen.",
};

const HELP_RE =
  /\?|\b(geen idee|weet (ik )?(het )?(nog )?niet|wat bedoel|hoe bedoel|snap (ik |het )?niet|suggesties?|voorbeeld(en)?|tips?|help|advies|wat raad)\b/i;

/**
 * Vraagt de bezoeker iets, of vraagt die om hulp? Dan geeft Charlie een echt
 * antwoord (app/api/geo/charlie) in plaats van het vaste zinnetje.
 */
export function needsCharlieReply(answer: string): boolean {
  return HELP_RE.test(answer);
}

/**
 * Een kort woord om door te gaan, zoals "ga door" of "prima". Zo'n woord is
 * geen antwoord op een inhoudelijke vraag en komt dus nooit in het rapport.
 */
const FILLER_RE =
  /^(ga( maar)? (door|verder)|door|verder|volgende|ok[eé]?|oke|prima|goed|top|ja|nee|akkoord|doe maar|geen|geen idee|weet ik niet|n\.?v\.?t\.?)[\s.!]*$/i;

export function isFiller(answer: string): boolean {
  return FILLER_RE.test(answer.trim());
}

/** Vragen waarbij het antwoord inhoud moet zijn. */
export const CONTENT_STEPS: GeoFieldKey[] = ["offer_description", "target_audience", "desired_queries"];

/** Zoveel keer per stap mag Charlie doorvragen. Daarna gaat de lijst verder. */
export const MAX_FOLLOW_UPS = 3;

/** A consent step is appended after the scripted questions. */
export const TOTAL_PROGRESS_STEPS = CHARLIE_STEPS.length + 1; // + consent

export function emptyLead(): Partial<GeoLeadInput> {
  return {};
}

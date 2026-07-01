import { fieldValidators } from "./validation";
import type { GeoLeadInput } from "./types";

/**
 * Brian — the NXTLI AI-analist persona and the scripted chat flow.
 * Kept as a standalone, declarative config so the chat component stays dumb
 * and the persona/copy can be tuned without touching UI logic.
 *
 * Tone of voice: slim, vriendelijk, direct, licht enthousiast, professioneel.
 * Geen overdreven AI-hype, geen jargon zonder uitleg.
 */

export const BRIAN = {
  name: "Brian",
  role: "AI-analist bij NXTLI",
  avatarInitial: "B",
  intro:
    "Tof! Ik ben Brian, AI-analist bij NXTLI. Ik ga in een paar stappen bekijken hoe goed jouw homepage vindbaar is in AI-antwoorden. Laten we beginnen.",
};

/** The key on GeoLeadInput each step writes to. */
export type GeoFieldKey =
  | "name"
  | "email"
  | "phone"
  | "job_title"
  | "company_name"
  | "homepage_url"
  | "offer_description"
  | "target_audience"
  | "desired_queries"
  | "competitors";

export interface BrianStep {
  key: GeoFieldKey;
  /** Brian's question, shown one at a time. */
  prompt: string;
  placeholder: string;
  /** Multi-line answer field for the longer, open questions. */
  multiline?: boolean;
  optional?: boolean;
  inputType?: "text" | "email" | "url";
  /** Returns an error string, or null when valid. */
  validate?: (value: string) => string | null;
  /** Brian's short, warm acknowledgement, optionally using the answer. */
  ack?: (value: string) => string;
}

export const BRIAN_STEPS: BrianStep[] = [
  {
    key: "name",
    prompt: "Laten we beginnen. Wat is je naam?",
    placeholder: "Bijv. Sanne",
    validate: fieldValidators.required,
    ack: (v) => `Leuk je te ontmoeten, ${v.split(" ")[0]}.`,
  },
  {
    key: "email",
    prompt:
      "Wat is je e-mailadres? Dan stuur ik je scanrapport straks naar je toe.",
    placeholder: "jij@bedrijf.nl",
    inputType: "email",
    validate: fieldValidators.email,
    ack: () => "Top, daar stuur ik je rapport straks naartoe.",
  },
  {
    key: "phone",
    prompt: "Wat is je telefoonnummer? Voor als we even willen sparren.",
    placeholder: "06 12345678",
    inputType: "text",
    validate: fieldValidators.phone,
    ack: () => "Genoteerd.",
  },
  {
    key: "company_name",
    prompt: "En wat is de naam van je bedrijf?",
    placeholder: "Bijv. NXTLI",
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
    prompt: "Wat is de URL van je homepage?",
    placeholder: "https://jouwbedrijf.nl",
    inputType: "url",
    validate: fieldValidators.url,
    ack: () => "Mooi, ik heb je website.",
  },
  {
    key: "offer_description",
    prompt: "Wat verkoop of bied je aan?",
    placeholder: "Beschrijf kort je belangrijkste producten of diensten.",
    multiline: true,
    validate: fieldValidators.required,
    ack: () =>
      "Duidelijk. Ik kijk straks vooral naar hoe helder je expertise, aanbod en autoriteit naar voren komen.",
  },
  {
    key: "target_audience",
    prompt: "Voor welke doelgroep wil je gevonden worden?",
    placeholder: "Bijv. mkb-ondernemers in de bouw, marketmanagers bij scale-ups…",
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
      "Goed. AI-systemen geven vaak voorkeur aan content die concreet, gestructureerd en betrouwbaar is. Daar ga ik je homepage op beoordelen.",
  },
  {
    key: "competitors",
    prompt:
      "Zijn er concurrenten of voorbeeldsites die je vaak tegenkomt? (optioneel, sla gerust over)",
    placeholder: "Bijv. concurrent.nl, voorbeeld.com",
    multiline: true,
    optional: true,
    ack: () => "Bedankt, dat helpt me bij de vergelijking.",
  },
];

/** Steps Brian shows while the scan runs (label + a short "what I'm doing"). */
export interface BrianProcessingStep {
  label: string;
  detail: string;
}

export const BRIAN_PROCESSING_STEPS: BrianProcessingStep[] = [
  {
    label: "Website ophalen",
    detail: "Ik haal je homepage op, plus robots.txt en llms.txt.",
  },
  {
    label: "Content analyseren",
    detail: "Ik lees je teksten: aanbod, expertise en structuur.",
  },
  {
    label: "AI-vindbaarheid beoordelen",
    detail: "Ik scoor op de criteria waar AI-systemen op letten.",
  },
  {
    label: "Verbeterpunten formuleren",
    detail: "Ik bepaal waar de grootste kansen liggen.",
  },
  {
    label: "Rapport genereren",
    detail: "Ik zet alles in jouw NXTLI-rapport.",
  },
];

export const BRIAN_COPY = {
  consentLabel:
    "Ik ga akkoord dat NXTLI mijn gegevens gebruikt om de scan uit te voeren en het rapport toe te sturen.",
  reviewLead: "Mooi, ik heb alles. Klopt dit zo?",
  scanningLead: "Top! Ik ga je homepage analyseren in NXTLI-format. Even geduld…",
  scanningSubtle: "Dit duurt meestal niet langer dan een minuutje.",
  successLead:
    "Je scan is klaar. Ik heb de belangrijkste kansen hieronder voor je samengevat.",
  emailNote: (email: string) =>
    `Ik heb het volledige rapport ook naar ${email} gestuurd.`,
  errorFallback:
    "Er ging iets mis met de automatische scan. We hebben je aanvraag wel ontvangen en kunnen je rapport handmatig nasturen.",
  finalCta:
    "Wil je dat we dit voor je verbeteren? Plan een korte GEO-strategiesessie met NXTLI.",
};

/** A consent step is appended after the scripted questions. */
export const TOTAL_PROGRESS_STEPS = BRIAN_STEPS.length + 1; // + consent

export function emptyLead(): Partial<GeoLeadInput> {
  return {};
}

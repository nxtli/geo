/**
 * DEMO DATA — ontwikkelfixtures (§24 van de briefing).
 *
 * Bewust ONMISKENBAAR nep, zodat deze rijen nooit voor echte research kunnen
 * doorgaan:
 *  - elke bedrijfsnaam begint met "DEMO —";
 *  - alle URL's gebruiken het `.invalid`-topleveldomein, dat per RFC 2606
 *    gereserveerd is en nooit kan bestaan;
 *  - `demo: true` staat op elke rij, en de UI zet daar een DEMO-badge bij;
 *  - de contactpersonen zijn verzonnen namen bij niet-bestaande bedrijven.
 *
 * Doel: de tabel, filters, tiers en de Waalaxy-export laten zien zonder dat
 * iemand denkt dat dit onderzochte prospects zijn. Verwijder ze met één klik.
 */

import type { FitComponentKey, Prospect } from "./types";
import { FIT_COMPONENTS, scoreProspect } from "./scoring";
import { createProspect } from "./store/serialize";
import { statusForTier } from "./research";

export const DEMO_PREFIX = "DEMO —";

interface DemoSpec {
  company_name: string;
  website: string;
  industry: string;
  segment: string;
  city: string;
  description: string;
  scores: Partial<Record<FitComponentKey, number>>;
  triggers: Array<{
    kind: Prospect["triggers"][number]["kind"];
    label: string;
    explanation: string;
    daysAgo: number | null;
    confidence: "high" | "medium" | "low";
  }>;
  angles: Array<{ kind: string; angle: string; strength: number }>;
  why: string[];
  role: Prospect["recommended_contact_role"];
  contact?: { first: string; last: string; title: string; linkedin: string | null };
  opening: string;
  reason: string;
  observation: string;
}

const SPECS: DemoSpec[] = [
  {
    company_name: `${DEMO_PREFIX} Zonnestraat Keukens`,
    website: "https://zonnestraat-keukens.invalid",
    industry: "Keukenspeciaalzaken",
    segment: "home_living",
    city: "Apeldoorn",
    description:
      "Fictieve keukenketen met vestigingen door heel Nederland. Gebruikt als voorbeeldrij om de tool te demonstreren.",
    scores: {
      b2c: 20,
      geographic: 15,
      marketing: 15,
      scale: 10,
      customer_value: 10,
      growth: 10,
      recruitment: 3,
      campaign: 5,
      awareness: 5,
      budget: 5,
    },
    triggers: [
      {
        kind: "new_location",
        label: "Opent twee nieuwe vestigingen",
        explanation: "Openingen zijn een concrete aanleiding voor regionale radio met einddatum.",
        daysAgo: 12,
        confidence: "high",
      },
      {
        kind: "new_campaign",
        label: "Nieuwe voorjaarscampagne aangekondigd",
        explanation: "Er loopt al een campagne; radio kan als extra bereikkanaal aansluiten.",
        daysAgo: 40,
        confidence: "medium",
      },
    ],
    angles: [
      {
        kind: "Retail",
        angle:
          "Landelijke keten met een hoge orderwaarde per klant. Landelijke awareness gecombineerd met regionale activatie rond de twee nieuwe vestigingen.",
        strength: 9,
      },
      {
        kind: "Launch",
        angle:
          "De twee openingen vormen een campagne met een harde einddatum — een korte, zware radioflight rond de opening ligt voor de hand.",
        strength: 8,
      },
    ],
    why: [
      "Hoge klantwaarde per order, waardoor paid media zich snel terugverdient.",
      "Landelijke dekking maakt landelijke radio bespreekbaar.",
      "Twee aanstaande openingen geven een concrete aanleiding.",
      "Zichtbaar actief met campagnes, dus er is waarschijnlijk mediabudget.",
      "Merkbekendheid weegt zwaar in deze categorie.",
    ],
    role: "Marketing Director",
    contact: {
      first: "Sanne",
      last: "de Vries",
      title: "Marketing Director",
      linkedin: "https://www.linkedin.com/in/demo-sanne-de-vries",
    },
    opening: "Zetten jullie radio momenteel al structureel in binnen jullie mediamix?",
    reason: "Twee aanstaande openingen bij een landelijke keten met hoge klantwaarde.",
    observation: "Landelijke dekking met vestigingen in meerdere regio's.",
  },
  {
    company_name: `${DEMO_PREFIX} Bakkerij Van Loon`,
    website: "https://bakkerij-van-loon.invalid",
    industry: "Ambachtelijke bakkerij",
    segment: "retail",
    city: "Zutphen",
    description:
      "Fictieve lokale bakkerij met twee filialen. Voorbeeldrij om te laten zien hoe een kleine, lokale speler wordt gewogen.",
    scores: {
      b2c: 15,
      geographic: 3,
      marketing: 5,
      scale: 2,
      customer_value: 1,
      growth: 0,
      recruitment: 3,
      campaign: 3,
      awareness: 3,
      budget: 1,
    },
    triggers: [
      {
        kind: "hiring_surge",
        label: "Zoekt bakkers en verkoopmedewerkers",
        explanation: "Wervingsbehoefte kan een regionale recruitmentcampagne rechtvaardigen.",
        daysAgo: null,
        confidence: "low",
      },
    ],
    angles: [
      {
        kind: "Recruitment",
        angle:
          "Openstaande vacatures voor bakkers. Regionale radio kan werken voor employer branding, maar het budget is de vraag bij deze omvang.",
        strength: 4,
      },
    ],
    why: [
      "Sterk consumentgericht, maar het verzorgingsgebied is één stad.",
      "Lage orderwaarde maakt paid media lastig terug te verdienen.",
      "Twee filialen: nauwelijks schaal voor een radiocampagne.",
      "Wel een wervingsbehoefte, wat een kleine regionale case kan zijn.",
      "Beperkte marketingactiviteit zichtbaar.",
    ],
    role: "Managing Director / eigenaar",
    opening: "Hoe vullen jullie nu jullie vacatures — werkt dat via de regio?",
    reason: "Wervingsbehoefte, maar beperkte schaal en budget.",
    observation: "Lokale speler met twee filialen in één verzorgingsgebied.",
  },
  {
    company_name: `${DEMO_PREFIX} Noordlicht Autogroep`,
    website: "https://noordlicht-autogroep.invalid",
    industry: "Autodealer",
    segment: "automotive",
    city: "Groningen",
    description:
      "Fictieve dealergroep met acht vestigingen in Noord-Nederland. Voorbeeld van een sterke regionale speler.",
    scores: {
      b2c: 20,
      geographic: 12,
      marketing: 10,
      scale: 8,
      customer_value: 10,
      growth: 5,
      recruitment: 5,
      campaign: 3,
      awareness: 5,
      budget: 3,
    },
    triggers: [
      {
        kind: "hiring_surge",
        label: "Veertien openstaande technische vacatures",
        explanation:
          "Structurele wervingsbehoefte in een krappe arbeidsmarkt: employer branding via regionale radio is een aparte ingang.",
        daysAgo: 20,
        confidence: "high",
      },
    ],
    angles: [
      {
        kind: "Recruitment",
        angle:
          "Veertien openstaande technische vacatures in Noord-Nederland. Regionale radio bereikt monteurs die niet actief op vacaturesites zoeken.",
        strength: 9,
      },
      {
        kind: "Retail",
        angle:
          "Acht vestigingen met zeer hoge klantwaarde per transactie. Regionale awareness rond acties en modeljaarwissels.",
        strength: 7,
      },
    ],
    why: [
      "Zeer hoge klantwaarde per klant — automotive verdient paid media snel terug.",
      "Acht vestigingen in meerdere regio's: regionale radio dekt het gebied precies.",
      "Veertien vacatures maken recruitment een sterke tweede angle.",
      "Merkbekendheid en top-of-mind zijn belangrijk bij autoaankopen.",
      "Marketing is actief maar niet uitgesproken volwassen.",
    ],
    role: "Recruitment / Employer Branding",
    contact: {
      first: "Joris",
      last: "Bakker",
      title: "Corporate Recruiter",
      linkedin: null,
    },
    opening: "Hoe vullen jullie nu die veertien technische vacatures in de regio?",
    reason: "Veertien openstaande technische vacatures in een krappe arbeidsmarkt.",
    observation: "Acht vestigingen in Noord-Nederland met hoge klantwaarde.",
  },
  {
    company_name: `${DEMO_PREFIX} Kalibra Industriële Sensoren`,
    website: "https://kalibra-sensoren.invalid",
    industry: "Industriële meetapparatuur",
    segment: "retail",
    city: "Helmond",
    description:
      "Fictieve leverancier van kalibratiesensoren aan machinebouwers. Voorbeeld van een prospect die op een knock-out afvalt.",
    scores: {
      b2c: 0,
      geographic: 12,
      marketing: 5,
      scale: 5,
      customer_value: 10,
      growth: 5,
      recruitment: 3,
      campaign: 0,
      awareness: 0,
      budget: 1,
    },
    triggers: [],
    angles: [],
    why: [
      "Puur specialistisch B2B: consumenten zijn geen doelgroep.",
      "Radio als massamedium sluit niet aan bij een inkoopproces van machinebouwers.",
      "Wel enkele vacatures, maar te weinig volume voor een radiocampagne.",
      "Geen campagne- of seizoensaanleiding zichtbaar.",
      "Merkbekendheid speelt nauwelijks een rol in deze aankoop.",
    ],
    role: "Head of Marketing",
    opening: "",
    reason: "Valt af: specialistisch B2B zonder consumentendoelgroep.",
    observation: "Levert uitsluitend aan machinebouwers en industriële partijen.",
  },
];

/** Bouw de demo-prospects, volledig doorgerekend met de echte scoring-engine. */
export function buildDemoProspects(now = new Date()): Prospect[] {
  return SPECS.map((spec) => {
    const base = createProspect(
      {
        company_name: spec.company_name,
        website: spec.website,
        industry: spec.industry,
        segment: spec.segment,
        city: spec.city,
        contact_first_name: spec.contact?.first ?? null,
        contact_last_name: spec.contact?.last ?? null,
        contact_title: spec.contact?.title ?? null,
        linkedin_url: spec.contact?.linkedin ?? null,
        contact_source: spec.contact ? "DEMO DATA" : null,
        notes: "DEMO DATA — fictief bedrijf, alleen om de tool te demonstreren.",
      },
      now,
    );

    const evidenceUrl = `${spec.website}/over-ons`;
    const triggers = spec.triggers.map((t) => ({
      kind: t.kind,
      label: t.label,
      explanation: t.explanation,
      source_url: evidenceUrl,
      date:
        t.daysAgo === null
          ? null
          : new Date(now.getTime() - t.daysAgo * 86_400_000).toISOString().slice(0, 10),
      confidence: t.confidence,
    }));

    // Componentscores opbouwen uit de rubric zelf, zodat de maxima hier nooit
    // kunnen afwijken van §3.
    const fitComponents = FIT_COMPONENTS.map((def) => ({
      key: def.key,
      label: def.label,
      max: def.max,
      score: spec.scores[def.key] ?? 0,
      rationale: "DEMO DATA — verzonnen onderbouwing voor demonstratiedoeleinden.",
      basis: "inference" as const,
    }));

    const evidence = [
      {
        url: evidenceUrl,
        title: `${spec.company_name} — over ons (DEMO)`,
        fact: "DEMO DATA — dit is geen echte bron. Het .invalid-domein bestaat niet.",
        date: null,
        confidence: "low" as const,
      },
    ];

    const scores = scoreProspect({
      fit_components: fitComponents,
      triggers,
      evidence,
      fetchedSourceCount: 3,
      purely_specialist_b2b: {
        value: spec.scores.b2c === 0 ? true : false,
        basis: "inference",
      },
      serves_dutch_market: { value: true, basis: "inference" },
      appears_active: { value: true, basis: "inference" },
      now: now.getTime(),
    });

    const primaryAngle = [...spec.angles].sort((a, b) => b.strength - a.strength)[0] ?? null;

    return {
      ...base,
      description: spec.description,
      country: "Nederland",
      fit_score: scores.fit_score,
      trigger_score: scores.trigger_score,
      priority_score: scores.priority_score,
      tier: scores.tier,
      fit_components: scores.fit_components,
      knockouts: scores.knockouts,
      knockout_override: scores.knockout_override,
      why_interesting: spec.why,
      triggers: scores.triggers,
      primary_trigger: scores.primary_trigger?.label ?? null,
      trigger_date: scores.primary_trigger?.date ?? null,
      sales_angles: spec.angles,
      primary_sales_angle: primaryAngle?.angle ?? null,
      angle_strength: primaryAngle?.strength ?? null,
      recommended_contact_role: spec.role,
      contact: {
        ...base.contact,
        confidence: spec.contact ? "low" : null,
      },
      personalization: spec.opening
        ? {
            reason: spec.reason,
            trigger: scores.primary_trigger?.label ?? "Geen concrete aanleiding.",
            observation: spec.observation,
            angle: primaryAngle?.kind ?? "Awareness",
            opening_question: spec.opening,
          }
        : null,
      evidence,
      research_confidence: scores.research_confidence,
      confidence: "low",
      date_researched: now.toISOString(),
      research_provider: "demo",
      demo: true,
      status: statusForTier(scores.tier),
    };
  });
}

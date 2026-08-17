/**
 * Heuristische research-provider — werkt zonder API-key.
 *
 * Geen AI, geen netwerk buiten de fetcher: puur trefwoordanalyse op de
 * opgehaalde paginatekst. Daardoor is de tool direct bruikbaar (en volledig
 * testbaar) zonder ANTHROPIC_API_KEY, en is elke uitkomst deterministisch.
 *
 * Wat deze provider WEL doet: signalen tellen die je met zekerheid uit tekst
 * kunt lezen (vacatures, vestigingen, webshop, landelijke dekking, acties).
 * Wat hij NIET doet: interpreteren, nuanceren of commercieel wegen zoals een
 * mens of een taalmodel dat kan. Daarom staat vrijwel alles op basis
 * "inference" en valt de research-confidence lager uit dan bij de Claude-provider
 * — precies zoals het hoort.
 *
 * Elke bron die hij noemt is een pagina die daadwerkelijk is opgehaald; er wordt
 * hier nooit een URL geconstrueerd.
 */

import type {
  ClaimKind,
  Evidence,
  FetchedSource,
  FitComponentKey,
  FitComponentScore,
  ProspectTrigger,
  ResearchInput,
  SalesAngle,
} from "../../types";
import type { ResearchOutcome, ResearchProvider } from "../provider";
import { FIT_COMPONENTS } from "../../scoring/rubric";
import { findSegment, RADIO_SEGMENTS } from "../../segments";
import { defaultRoleFor } from "../../roles";
import { truncate } from "../../validation";

interface Signal {
  /** Aantal treffers in de gecombineerde tekst. */
  hits: number;
  /** De bron waar de eerste treffer stond. */
  source: FetchedSource | null;
  /** Het tekstfragment rond de eerste treffer. */
  snippet: string | null;
}

const PATTERNS = {
  vacancies: /vacature|werken bij|solliciteer|we zoeken|wij zoeken|join our team|open positions?/gi,
  locations: /vestiging|filiaal|filialen|winkels?|locaties?|onze winkels|bij jou in de buurt/gi,
  nationwide: /heel nederland|door heel nederland|landelijk|in het hele land|nederland en belgi/gi,
  webshop: /webshop|bestel|in je mandje|winkelwagen|gratis verzending|afrekenen|bezorg/gi,
  promotions: /actie|aanbieding|korting|sale|black friday|uitverkoop|nu tijdelijk|% korting/gi,
  campaign: /campagne|commercial|tv-spot|radiospot|adverteren|onze nieuwe campagne/gi,
  newLocation: /nieuwe vestiging|nieuwe winkel|opening|binnenkort open|nu ook in|we openen/gi,
  launch: /nieuw in ons assortiment|introduce|introductie|lancering|nieuwe collectie|primeur/gi,
  growth: /groei|groeien|uitbreiding|breiden uit|expansie|nieuwe markt|record/gi,
  anniversary: /jubileum|bestaat \d+ jaar|\d+ jaar bestaan|lustrum/gi,
  sponsorship: /sponsor|hoofdsponsor|partner van/gi,
  subscription: /abonnement|lidmaatschap|maandelijks opzegbaar|per maand/gi,
  b2bOnly: /groothandel|b2b|zakelijke klanten|voor bedrijven|oem|toeleverancier|wholesale/gi,
  consumer: /voor jou|jij|jouw|klanten|consument|particulier|thuis|gezin/gi,
  socials: /instagram|facebook|tiktok|youtube|linkedin|volg ons/gi,
  marketingTeam: /marketing manager|marketingteam|head of marketing|cmo|brand manager|marketeer/gi,
};

/** Zoek een patroon in alle bronnen; geef treffers + eerste vindplaats. */
function findSignal(sources: FetchedSource[], pattern: RegExp): Signal {
  let hits = 0;
  let source: FetchedSource | null = null;
  let snippet: string | null = null;

  for (const s of sources) {
    // Nieuwe regex per bron: /g-regexes houden state vast in lastIndex.
    const re = new RegExp(pattern.source, pattern.flags);
    const matches = s.text.match(re);
    if (matches && matches.length > 0) {
      hits += matches.length;
      if (!source) {
        source = s;
        const index = s.text.search(new RegExp(pattern.source, pattern.flags.replace("g", "")));
        if (index >= 0) {
          snippet = s.text.slice(Math.max(0, index - 60), index + 140).replace(/\s+/g, " ").trim();
        }
      }
    }
  }
  return { hits, source, snippet };
}

/**
 * Bovengrens voor de heuristiek: het één-na-hoogste anker van een component.
 *
 * Trefwoorden tellen kan de HOOGSTE ankerwaarde nooit onderbouwen. "Duidelijk
 * volwassen adverteerder" (15/15) of "zeer hoge klantwaarde" (10/10) vraagt een
 * inhoudelijk oordeel; zes keer het woord "campagne" op een pagina is dat niet.
 * Zonder deze grens haalde een doorsnee-website al fit 90/100 — een score die
 * Tier A suggereert op basis van niets.
 *
 * Praktisch gevolg: de heuristiek komt maximaal op fit 69 en daarmee tot Tier B.
 * Een Tier A-kwalificatie vraagt de AI-provider of het oordeel van Eric zelf.
 */
function heuristicCap(componentKey: FitComponentKey): number {
  const def = FIT_COMPONENTS.find((c) => c.key === componentKey)!;
  const descending = [...def.anchors].map((a) => a.score).sort((a, b) => b - a);
  return descending[1] ?? descending[0] ?? 0;
}

/** Kies een score uit de ankers van een component op basis van een drempeltabel. */
function pickScore(
  componentKey: FitComponentKey,
  thresholds: Array<[number, number]>,
  value: number,
): number {
  const def = FIT_COMPONENTS.find((c) => c.key === componentKey)!;
  const ceiling = Math.min(def.max, heuristicCap(componentKey));
  for (const [minimum, score] of thresholds) {
    if (value >= minimum) return Math.min(score, ceiling);
  }
  return 0;
}

export class HeuristicResearchProvider implements ResearchProvider {
  readonly id = "heuristic";

  /** Altijd beschikbaar — dat is het punt van deze provider. */
  isConfigured(): boolean {
    return true;
  }

  async research(input: ResearchInput): Promise<ResearchOutcome> {
    const sources = input.web.sources;

    // Zonder opgehaalde pagina's is er niets te zeggen. Alles unknown, score 0.
    if (sources.length === 0) {
      return {
        result: {
          company_name: input.company_name,
          industry: input.hints?.industry ?? null,
          segment: findSegment(input.hints?.segment)?.key ?? null,
          description: null,
          city: input.hints?.city ?? null,
          country: null,
          company_size: { value: null, basis: "unknown" },
          number_of_locations: { value: null, basis: "unknown" },
          appears_active: { value: null, basis: "unknown" },
          serves_dutch_market: { value: null, basis: "unknown" },
          purely_specialist_b2b: { value: null, basis: "unknown" },
          fit_components: FIT_COMPONENTS.map((c) => ({
            key: c.key,
            label: c.label,
            max: c.max,
            score: 0,
            rationale: "Geen publieke pagina kunnen ophalen — geen signaal beschikbaar.",
            basis: "unknown" as ClaimKind,
          })),
          triggers: [],
          sales_angles: [],
          why_interesting: [
            "Er is geen publieke website-informatie opgehaald, dus dit bedrijf kan niet beoordeeld worden.",
          ],
          recommended_contact_role: "Head of Marketing",
          contact_person: null,
          personalization: null,
          evidence: [],
          radio_use_case_override: null,
        },
        rejected_sources: [],
      };
    }

    const signals = {
      vacancies: findSignal(sources, PATTERNS.vacancies),
      locations: findSignal(sources, PATTERNS.locations),
      nationwide: findSignal(sources, PATTERNS.nationwide),
      webshop: findSignal(sources, PATTERNS.webshop),
      promotions: findSignal(sources, PATTERNS.promotions),
      campaign: findSignal(sources, PATTERNS.campaign),
      newLocation: findSignal(sources, PATTERNS.newLocation),
      launch: findSignal(sources, PATTERNS.launch),
      growth: findSignal(sources, PATTERNS.growth),
      anniversary: findSignal(sources, PATTERNS.anniversary),
      sponsorship: findSignal(sources, PATTERNS.sponsorship),
      subscription: findSignal(sources, PATTERNS.subscription),
      b2bOnly: findSignal(sources, PATTERNS.b2bOnly),
      consumer: findSignal(sources, PATTERNS.consumer),
      socials: findSignal(sources, PATTERNS.socials),
      marketingTeam: findSignal(sources, PATTERNS.marketingTeam),
    };

    const homepage = sources[0];
    const evidence: Evidence[] = [];
    const addEvidence = (signal: Signal, fact: string): void => {
      if (!signal.source || signal.hits === 0) return;
      if (evidence.some((e) => e.fact === fact)) return;
      evidence.push({
        url: signal.source.url,
        title: signal.source.title ?? signal.source.url,
        fact: truncate(fact, 300),
        date: null,
        confidence: signal.hits >= 3 ? "medium" : "low",
      });
    };

    /* Segment raden uit de tekst ---------------------------------------- */
    const combined = sources.map((s) => s.text).join("\n").toLowerCase();
    const segmentGuess =
      findSegment(input.hints?.segment)?.key ??
      RADIO_SEGMENTS.find((s) =>
        s.hint
          .toLowerCase()
          .split(/[,.]/)
          .map((w) => w.trim())
          .filter((w) => w.length > 5)
          .some((word) => combined.includes(word)),
      )?.key ??
      null;

    /* Componentscores --------------------------------------------------- */
    const consumerSignal = signals.consumer.hits + signals.webshop.hits * 2;
    const b2bSignal = signals.b2bOnly.hits;
    const b2cScore = b2bSignal > consumerSignal
      ? pickScore("b2c", [[3, 5]], b2bSignal)
      : pickScore("b2c", [[12, 20], [6, 15], [2, 10], [1, 5]], consumerSignal);

    const geographicScore = pickScore(
      "geographic",
      [[3, 15], [1, 12]],
      signals.nationwide.hits,
    ) || pickScore("geographic", [[4, 12], [1, 8]], signals.locations.hits);

    const marketingScore = pickScore(
      "marketing",
      [[6, 15], [3, 10], [1, 5]],
      signals.campaign.hits + signals.socials.hits + signals.marketingTeam.hits,
    );

    const scaleScore = pickScore("scale", [[8, 10], [4, 8], [1, 5]], signals.locations.hits);

    const segmentDef = segmentGuess ? findSegment(segmentGuess) : null;
    // Ook hier de heuristiek-plafond: een segmentgemiddelde is een indicatie,
    // geen vastgestelde klantwaarde voor dít bedrijf.
    const customerValueScore = Math.min(
      heuristicCap("customer_value"),
      segmentDef
        ? segmentDef.typical_customer_value
        : signals.subscription.hits > 0
          ? 7
          : 4,
    );

    const growthScore = pickScore(
      "growth",
      [[3, 10], [1, 5]],
      signals.growth.hits + signals.newLocation.hits,
    );

    const recruitmentScore = pickScore("recruitment", [[5, 5], [1, 3]], signals.vacancies.hits);

    const campaignScore = pickScore(
      "campaign",
      [[4, 5], [1, 3]],
      signals.promotions.hits + signals.launch.hits,
    );

    const awarenessScore = pickScore(
      "awareness",
      [[4, 5], [1, 3]],
      signals.campaign.hits + signals.promotions.hits,
    );

    const budgetScore = pickScore(
      "budget",
      [[6, 5], [3, 3], [1, 1]],
      signals.campaign.hits + signals.socials.hits + signals.sponsorship.hits,
    );

    const scoreByKey: Record<string, { score: number; rationale: string; basis: ClaimKind }> = {
      b2c: {
        score: b2cScore,
        rationale:
          b2bSignal > consumerSignal
            ? `Overwegend zakelijke taal aangetroffen (${b2bSignal} B2B-signalen tegen ${consumerSignal} consumentensignalen).`
            : `${consumerSignal} consumentensignalen in de tekst (webshop- en particuliere aanspreekvorm).`,
        basis: consumerSignal + b2bSignal > 0 ? "inference" : "unknown",
      },
      geographic: {
        score: geographicScore,
        rationale: signals.nationwide.hits
          ? `Tekst wijst op landelijke dekking (${signals.nationwide.hits}×).`
          : signals.locations.hits
            ? `${signals.locations.hits} verwijzingen naar vestigingen/winkels.`
            : "Geen signalen over verzorgingsgebied gevonden.",
        basis: signals.nationwide.hits + signals.locations.hits > 0 ? "inference" : "unknown",
      },
      marketing: {
        score: marketingScore,
        rationale: `${signals.campaign.hits} campagne-, ${signals.socials.hits} social- en ${signals.marketingTeam.hits} marketingrol-signalen.`,
        basis:
          signals.campaign.hits + signals.socials.hits + signals.marketingTeam.hits > 0
            ? "inference"
            : "unknown",
      },
      scale: {
        score: scaleScore,
        rationale: signals.locations.hits
          ? `${signals.locations.hits} verwijzingen naar vestigingen of winkels.`
          : "Geen schaalsignalen gevonden.",
        basis: signals.locations.hits > 0 ? "inference" : "unknown",
      },
      customer_value: {
        score: customerValueScore,
        rationale: segmentDef
          ? `Ingeschat op basis van segment "${segmentDef.label}" — geen concrete orderwaarde gevonden.`
          : "Geen segment kunnen bepalen; gemiddelde klantwaarde aangenomen.",
        basis: "inference",
      },
      growth: {
        score: growthScore,
        rationale:
          signals.growth.hits + signals.newLocation.hits > 0
            ? `${signals.growth.hits} groei- en ${signals.newLocation.hits} openingssignalen.`
            : "Geen groeisignalen gevonden.",
        basis: signals.growth.hits + signals.newLocation.hits > 0 ? "inference" : "unknown",
      },
      recruitment: {
        score: recruitmentScore,
        rationale: signals.vacancies.hits
          ? `${signals.vacancies.hits} vacature-signalen aangetroffen.`
          : "Geen vacaturesignalen gevonden.",
        basis: signals.vacancies.hits > 0 ? "inference" : "unknown",
      },
      campaign: {
        score: campaignScore,
        rationale:
          signals.promotions.hits + signals.launch.hits > 0
            ? `${signals.promotions.hits} actie- en ${signals.launch.hits} introductiesignalen.`
            : "Geen actie- of seizoenssignalen gevonden.",
        basis: signals.promotions.hits + signals.launch.hits > 0 ? "inference" : "unknown",
      },
      awareness: {
        score: awarenessScore,
        rationale:
          signals.campaign.hits + signals.promotions.hits > 0
            ? "Communicatie is merk- en actiegericht, wat op awareness-afhankelijkheid wijst."
            : "Geen signalen over het belang van merkbekendheid.",
        basis: signals.campaign.hits + signals.promotions.hits > 0 ? "inference" : "unknown",
      },
      budget: {
        score: budgetScore,
        rationale:
          "Ingeschat uit zichtbare marketingactiviteit; geen budget- of omzetgegevens gevonden.",
        basis: signals.campaign.hits + signals.socials.hits > 0 ? "inference" : "unknown",
      },
    };

    const fit_components: FitComponentScore[] = FIT_COMPONENTS.map((def) => {
      const entry = scoreByKey[def.key];
      return {
        key: def.key,
        label: def.label,
        max: def.max,
        score: entry.score,
        rationale: entry.rationale,
        basis: entry.basis,
      };
    });

    addEvidence(signals.vacancies, "Website vermeldt openstaande vacatures.");
    addEvidence(signals.locations, "Website verwijst naar meerdere vestigingen of winkels.");
    addEvidence(signals.nationwide, "Website suggereert landelijke dekking.");
    addEvidence(signals.webshop, "Website heeft een webshop-/bestelfunctie.");
    addEvidence(signals.promotions, "Website toont acties of aanbiedingen.");
    addEvidence(signals.campaign, "Website verwijst naar campagne- of advertentie-activiteit.");
    addEvidence(signals.newLocation, "Website vermeldt een (aanstaande) opening.");
    addEvidence(signals.socials, "Website linkt naar actieve socialmediakanalen.");

    /* Triggers — alleen met een echte bron ------------------------------ */
    const triggers: ProspectTrigger[] = [];
    const addTrigger = (
      signal: Signal,
      kind: ProspectTrigger["kind"],
      label: string,
      explanation: string,
      minimumHits = 1,
    ): void => {
      if (!signal.source || signal.hits < minimumHits) return;
      triggers.push({
        kind,
        label,
        explanation,
        source_url: signal.source.url,
        // Heuristiek kan geen datum vaststellen — bewust null, wat de
        // trigger-score automatisch lager maakt.
        date: null,
        confidence: signal.hits >= 3 ? "medium" : "low",
      });
    };

    addTrigger(
      signals.newLocation,
      "new_location",
      "Website vermeldt een (aanstaande) opening",
      "Een opening is een concrete campagne-aanleiding voor regionale radio.",
    );
    addTrigger(
      signals.vacancies,
      "hiring_surge",
      "Meerdere openstaande vacatures op de website",
      "Wervingsbehoefte maakt een employer-branding- of recruitmentcampagne relevant.",
      3,
    );
    addTrigger(
      signals.promotions,
      "major_promotion",
      "Actie of aanbieding actief",
      "Een lopende actie is een korte, concrete aanleiding voor radio-ondersteuning.",
      3,
    );
    addTrigger(
      signals.launch,
      "product_launch",
      "Nieuwe collectie of introductie aangekondigd",
      "Een introductie vraagt om bereik in korte tijd.",
      2,
    );
    addTrigger(
      signals.growth,
      "strong_growth",
      "Website communiceert groei of uitbreiding",
      "Groei gaat vaak samen met ruimte voor extra mediabudget.",
      3,
    );
    addTrigger(
      signals.anniversary,
      "anniversary",
      "Jubileum vermeld op de website",
      "Een jubileum is een natuurlijke campagne-aanleiding.",
    );

    /* Sales angles ------------------------------------------------------ */
    const sales_angles: SalesAngle[] = [];
    if (scaleScore >= 8 && b2cScore >= 15) {
      sales_angles.push({
        kind: "Retail",
        angle:
          "Meerdere vestigingen met een brede consumentendoelgroep. Landelijke awareness gecombineerd met lokale activatie per vestiging kan interessant zijn.",
        strength: 8,
      });
    }
    if (recruitmentScore >= 3) {
      sales_angles.push({
        kind: "Recruitment",
        angle:
          "Openstaande vacatures op de eigen site. Een employer-branding- of recruitmentcampagne via regionale radio is een aparte, concrete ingang.",
        strength: recruitmentScore >= 5 ? 8 : 6,
      });
    }
    if (signals.newLocation.hits > 0) {
      sales_angles.push({
        kind: "Launch",
        angle:
          "Er wordt een opening of nieuwe locatie gecommuniceerd — dat vormt een concrete campagne-aanleiding met een duidelijke einddatum.",
        strength: 7,
      });
    }
    if (sales_angles.length === 0 && signals.webshop.hits > 0) {
      sales_angles.push({
        kind: "Online-heavy advertiser",
        angle:
          "Sterk online georiënteerde verkoop. Interessante opening om radio als aanvullend massabereik naast de bestaande online inzet te bespreken.",
        strength: 5,
      });
    }
    // Sterkste eerst, zodat sales_angles[0] overal de primaire angle is — ook in
    // het personalisatieblok hieronder.
    sales_angles.sort((a, b) => b.strength - a.strength);

    /* Waarom interessant ------------------------------------------------ */
    const why_interesting = [
      `Consumentenrelevantie ingeschat op ${b2cScore}/20 op basis van ${consumerSignal} consumentensignalen.`,
      geographicScore >= 12
        ? "Lijkt landelijk of in meerdere regio's actief — landelijke radio is bespreekbaar."
        : `Verzorgingsgebied ingeschat op ${geographicScore}/15.`,
      signals.vacancies.hits > 0
        ? `${signals.vacancies.hits} vacature-signalen: recruitment is een mogelijke tweede angle.`
        : "Geen vacaturesignalen — recruitment lijkt geen ingang.",
      signals.campaign.hits > 0
        ? "Er zijn campagne- of advertentiesignalen, wat op een bestaand mediabudget wijst."
        : "Nauwelijks campagnesignalen gevonden; mediabudget is onzeker.",
      "Let op: deze beoordeling is trefwoordgebaseerd zonder AI-analyse — controleer de scores voor een gesprek.",
    ].slice(0, 5);

    const primaryAngleIsRecruitment = sales_angles[0]?.kind === "Recruitment";

    return {
      result: {
        company_name: input.company_name,
        industry: input.hints?.industry ?? null,
        segment: segmentGuess,
        description: truncate(homepage.text.replace(/\n+/g, " ").trim(), 300) || null,
        city: input.hints?.city ?? null,
        country: signals.nationwide.hits > 0 ? "Nederland" : null,
        // Heuristiek stelt nooit aantallen vast.
        company_size: { value: null, basis: "unknown" },
        number_of_locations: { value: null, basis: "unknown" },
        appears_active: { value: true, basis: "inference" },
        serves_dutch_market: {
          value: signals.nationwide.hits > 0 ? true : null,
          basis: signals.nationwide.hits > 0 ? "inference" : "unknown",
        },
        purely_specialist_b2b: {
          value: b2bSignal > consumerSignal * 2 ? true : null,
          basis: b2bSignal > consumerSignal * 2 ? "inference" : "unknown",
        },
        fit_components,
        triggers,
        sales_angles: sales_angles.slice(0, 3),
        why_interesting,
        recommended_contact_role: defaultRoleFor({
          recruitmentIsPrimaryAngle: primaryAngleIsRecruitment,
          scaleScore,
        }),
        contact_person: null,
        personalization: {
          reason:
            sales_angles[0]?.angle ??
            "Consumentgerichte propositie waarbij radio massabereik kan toevoegen.",
          trigger: triggers[0]?.label ?? "Geen concrete recente aanleiding gevonden.",
          observation: `Website-analyse: ${signals.locations.hits} vestigingsverwijzingen, ${signals.vacancies.hits} vacaturesignalen, ${signals.campaign.hits} campagnesignalen.`,
          angle: sales_angles[0]?.kind ?? "Awareness",
          opening_question:
            "Zetten jullie radio momenteel al structureel in binnen jullie mediamix?",
        },
        evidence,
        radio_use_case_override: null,
      },
      rejected_sources: [],
    };
  }
}

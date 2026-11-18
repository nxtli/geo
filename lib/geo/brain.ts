import type { BuyerContext } from "./types";

/**
 * Koppeling met het Marketingbrein. Zet de uitvoer van `get_marketing_brain`
 * om naar de koperskennis die de scan gebruikt.
 *
 * Alleen goedgekeurde kennis (`present`) telt. `initialProfile` is door AI uit
 * de website afgeleid en niet getoetst: wie dáár klantvragen uit haalt, toetst
 * de pagina aan zichzelf. Die bron wordt daarom niet gebruikt.
 *
 * De kennistypen in het brein zijn hier op trefwoord herkend. Pas TYPE_MAP aan
 * zodra de definitieve typenamen vaststaan.
 */
export interface BrainKnowledge {
  knowledgeNumber?: string | number;
  type?: string;
  name?: string;
  content?: string;
}
export interface BrainBlock {
  key?: string;
  number?: number | null;
  present?: BrainKnowledge[];
  missing?: string[];
}
export interface MarketingBrain {
  brandName?: string;
  initialProfile?: unknown;
  blocks?: BrainBlock[];
}

type Slot = "audience" | "question" | "criteria" | "offer" | "competitor" | "positioning";
const TYPE_MAP: Array<[RegExp, Slot]> = [
  [/vraag|vragen|faq/i, "question"],
  [/keuzecriteri|aankoopcriteri|beslis/i, "criteria"],
  [/publiek|doelgroep|persona/i, "audience"],
  [/product|dienst|aanbod|propositie/i, "offer"],
  [/concurrent/i, "competitor"],
  [/positionering|kernbelofte|merkbelofte/i, "positioning"],
];
const NEEDED: Array<[Slot, string]> = [
  ["question", "Veelgestelde vragen van kopers"],
  ["audience", "Publieken"],
  ["offer", "Aanbod met prijs en voorwaarden"],
  ["criteria", "Keuzecriteria van de koper"],
];

function slotOf(k: BrainKnowledge, blockKey: string): Slot | null {
  const hay = `${k.type ?? ""} ${blockKey}`;
  for (const [re, slot] of TYPE_MAP) if (re.test(hay)) return slot;
  return null;
}
const ref = (k: BrainKnowledge) => (k.knowledgeNumber != null ? `K${String(k.knowledgeNumber).replace(/^K/i, "")}` : undefined);
const text = (k: BrainKnowledge) => [k.name, k.content].filter(Boolean).join(": ").trim();

export function buyerFromBrain(brain: MarketingBrain): BuyerContext {
  const ctx: BuyerContext = {
    origin: "marketingbrein",
    audiences: [],
    questions: [],
    decision_criteria: [],
    offers: [],
    competitors: [],
    positioning: null,
    gaps: [],
  };
  const found = new Set<Slot>();
  for (const block of brain.blocks ?? []) {
    for (const k of block.present ?? []) {
      const slot = slotOf(k, block.key ?? "");
      if (!slot || !text(k)) continue;
      found.add(slot);
      const tagged = `${ref(k) ? `[${ref(k)}] ` : ""}${text(k)}`;
      if (slot === "question") ctx.questions.push({ text: k.name || k.content || "", source: "Marketingbrein, goedgekeurd", ref: ref(k) });
      else if (slot === "audience") ctx.audiences.push(tagged);
      else if (slot === "criteria") ctx.decision_criteria.push(tagged);
      else if (slot === "offer") ctx.offers.push(tagged);
      else if (slot === "competitor") ctx.competitors.push(text(k));
      else if (slot === "positioning" && !ctx.positioning) ctx.positioning = tagged;
    }
    for (const m of block.missing ?? []) ctx.gaps.push(`Ontbreekt in het brein: ${m}`);
  }
  for (const [slot, label] of NEEDED) {
    if (!found.has(slot)) ctx.gaps.push(`Niet gevonden in het brein: ${label}`);
  }
  return ctx;
}

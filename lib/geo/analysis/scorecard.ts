import type { CategoryScore, CriterionResult, GeoAction, GeoAnalysisResult, PriorityAction } from "../types";
import { criterionWeight, getCriterion, getEvidence, OWNER_LABEL, SCORECARD } from "../knowledge";

const VALUE = SCORECARD.verdict_values;

/** Eén oordeel per criterium uit het model; ontbrekende criteria worden "nvt". */
export function normalizeCriteria(returned: CriterionResult[]): CriterionResult[] {
  const byId = new Map(returned.map((c) => [c.id.trim().toUpperCase(), c]));
  return SCORECARD.dimensions.flatMap((d) =>
    d.criteria.map((c) => {
      const r = byId.get(c.id);
      return r
        ? { ...r, id: c.id }
        : { id: c.id, verdict: "nvt" as const, finding: "Niet beoordeeld.", quote: "" };
    }),
  );
}

/**
 * Rekent de oordelen om naar punten per dimensie. "nvt" telt niet mee: de
 * dimensie wordt beoordeeld over de criteria die wel een oordeel hebben. Een
 * dimensie zonder enkel oordeel volgt het gemiddelde van de rest.
 */
export function scoreFromCriteria(criteria: CriterionResult[]): { category_scores: CategoryScore[]; assessed: number } {
  const byId = new Map(criteria.map((c) => [c.id, c]));
  let got = 0;
  let assessed = 0;
  const rows = SCORECARD.dimensions.map((d) => {
    let g = 0;
    let a = 0;
    const notes: string[] = [];
    let ok = 0;
    for (const c of d.criteria) {
      const r = byId.get(c.id);
      if (!r || r.verdict === "nvt") continue;
      g += c.max * VALUE[r.verdict];
      a += c.max;
      if (r.verdict === "voldoet") ok++;
      else if (r.finding) notes.push(`${c.id}: ${r.finding}`);
    }
    got += g;
    assessed += a;
    const max = d.criteria.reduce((s, c) => s + c.max, 0);
    const judged = d.criteria.filter((c) => byId.get(c.id) && byId.get(c.id)!.verdict !== "nvt").length;
    return { d, g, a, max, summary: `${ok} van ${judged} beoordeelde criteria voldoen.${notes.length ? " " + notes.slice(0, 2).join(" ") : ""}` };
  });
  const overall = assessed ? got / assessed : 0;
  return {
    assessed,
    category_scores: rows.map(({ d, g, a, max, summary }) => ({
      key: d.key,
      label: d.label,
      max,
      score: Math.round(max * (a ? g / a : overall)),
      summary: a ? summary : "Niet te beoordelen in deze scan.",
    })),
  };
}

const EFFORT_ORDER = { laag: 0, midden: 1, hoog: 2 } as const;

/**
 * Maakt van de voorstellen van het taalmodel uitvoerbare adviezen:
 *  - alleen bij criteria die punten laten liggen
 *  - eigenaar, "klaar als", bewijskracht en bron komen uit de kennisbank
 *  - een criterium zonder voorstel krijgt het standaardadvies uit het model
 *  - volgorde: poortwachters eerst, daarna punten × bewijskracht
 */
export function buildActions(criteria: CriterionResult[], proposed: GeoAction[], gateActions: GeoAction[]): GeoAction[] {
  const proposals = new Map<string, GeoAction>();
  for (const p of proposed) {
    const id = p.criterion.trim().toUpperCase();
    if (!proposals.has(id)) proposals.set(id, p);
  }
  const out: Array<GeoAction & { prio: number }> = [];
  for (const r of criteria) {
    if (r.verdict !== "niet" && r.verdict !== "deels") continue;
    const c = getCriterion(r.id);
    if (!c) continue;
    const points = Math.round(c.max * (1 - VALUE[r.verdict]) * 10) / 10;
    const ev = getEvidence(c.evidence[0]);
    const p = proposals.get(c.id);
    out.push({
      title: p?.title?.trim() || c.fix,
      criterion: c.id,
      why: p?.why?.trim() || r.finding,
      where: p?.where?.trim() || "",
      before: p?.before?.trim() || r.quote || "",
      after: p?.after?.trim() || "",
      owner: OWNER_LABEL[c.owner],
      effort: p?.effort ?? "midden",
      done_when: c.done_when,
      points,
      evidence_grade: ev?.grade ?? "zwak",
      source: ev?.sources[0]?.title ?? "",
      prio: points * criterionWeight(c),
    });
  }
  out.sort((a, b) => b.prio - a.prio || EFFORT_ORDER[a.effort] - EFFORT_ORDER[b.effort]);
  return [...gateActions, ...out.map(({ prio: _prio, ...a }) => a)];
}

/** Afgeleide velden voor de bestaande chat-preview en het rapport. */
export function deriveLegacyLists(actions: GeoAction[]): Pick<GeoAnalysisResult, "quick_wins" | "thirty_day_action_plan"> {
  const quick = [...actions.filter((a) => a.points === 0), ...actions.filter((a) => a.points > 0 && a.effort === "laag")];
  const rest = actions.filter((a) => !quick.includes(a));
  const plan: PriorityAction[] = actions.map((a) => ({ title: a.title, why: a.why, effort: a.effort }));
  return {
    quick_wins: [...quick, ...rest].slice(0, 5).map((a) => a.title),
    thirty_day_action_plan: plan,
  };
}

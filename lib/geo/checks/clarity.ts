import type { PageFacts } from "../facts/page";
import type { CheckDefinition } from "./types";
import { notFetched } from "./types";

/** Below this many words the page counts as thin (same threshold as the fact layer). */
export const THIN_WORD_COUNT = 150;

/** The h1 evidence is cut to this many characters. */
export const H1_EVIDENCE_MAX = 120;

/** The first h1's text, trimmed and cut to H1_EVIDENCE_MAX characters (ending in "…" when cut); null without an h1. */
function firstH1(headings: { level: number; text: string }[]): string | null {
  const text = headings.find((h) => h.level === 1)?.text.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > H1_EVIDENCE_MAX ? `${text.slice(0, H1_EVIDENCE_MAX - 1).trimEnd()}…` : text;
}

/** The structure verdict alone: fail for a JS shell, pass when nothing is off, attention otherwise. */
function structureOf(facts: PageFacts): { status: "pass" | "attention" | "fail"; issues: string[] } {
  if (facts.jsShell) return { status: "fail", issues: [] };
  const issues: string[] = [];
  if (facts.h1Count !== 1) issues.push(`${facts.h1Count} h1 headings instead of 1`);
  if (facts.skippedHeadingLevel) issues.push("a skipped heading level");
  if (!facts.title) issues.push("no title");
  if (!facts.description) issues.push("no meta description");
  if (facts.wordCount < THIN_WORD_COUNT) issues.push(`only ${facts.wordCount} words`);
  return { status: issues.length === 0 ? "pass" : "attention", issues };
}

/**
 * Is the core offer or message clear in the first screen? With a model
 * verdict (`clarity.ok`), that verdict is the status and its reason the
 * summary; the measurable structure stays in the facts as evidence. Without
 * one (no judge, or it gave no verdict) the check is structure only, as
 * before: fail when the content is not in the HTML (JS shell), pass with
 * exactly one h1, no skipped heading level, title and description present and
 * at least THIN_WORD_COUNT words, attention otherwise. A JS shell is always a
 * fail: there is no first screen in the HTML to judge. Evidence: the first
 * h1's text.
 */
export const clarityCheck: CheckDefinition = {
  id: "clarity",
  label: "Clarity",
  run({ facts, clarity }) {
    if (!facts) return notFetched("clarity");
    const verdict = !facts.jsShell && clarity?.ok ? clarity : null;
    const result = {
      h1_count: facts.h1Count,
      skipped_heading_level: facts.skippedHeadingLevel,
      title_present: Boolean(facts.title),
      description_present: Boolean(facts.description),
      word_count: facts.wordCount,
      js_shell: facts.jsShell,
      llm_verdict: verdict?.verdict ?? null,
      llm_reason: verdict?.reason ?? null,
      ...(clarity && !clarity.ok ? { llm_error: clarity.reason } : {}),
    };
    const evidence = firstH1(facts.headings);
    const structure = structureOf(facts);
    const structureNote = structure.issues.length > 0 ? ` Structure issues: ${structure.issues.join(", ")}.` : "";
    // Asked but no verdict: say so, so a structure-only pass is not read as the first-screen judgement.
    const missingNote = clarity && !clarity.ok && !facts.jsShell ? " The first-screen verdict was unavailable; structure only." : "";
    if (verdict) {
      return { id: "clarity", status: verdict.verdict, summary: `${verdict.reason}${structureNote}`, facts: result, evidence };
    }
    if (facts.jsShell) {
      return {
        id: "clarity",
        status: "fail",
        summary: `Only ${facts.wordCount} words in the HTML; the content appears to be rendered by JavaScript.`,
        facts: result,
        evidence,
      };
    }
    if (structure.status === "pass") {
      return {
        id: "clarity",
        status: "pass",
        summary: `One h1, no skipped heading levels, title and description present, ${facts.wordCount} words.${missingNote}`,
        facts: result,
        evidence,
      };
    }
    return { id: "clarity", status: "attention", summary: `Structure issues: ${structure.issues.join(", ")}.${missingNote}`, facts: result, evidence };
  },
};

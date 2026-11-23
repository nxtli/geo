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

/**
 * Measurable structure only, never a judgement on the prose.
 * Fail: the content is not in the HTML (JS shell). Pass: exactly one h1, no
 * skipped heading level, title and description present, at least
 * THIN_WORD_COUNT words. Attention otherwise. Evidence: the first h1's text.
 */
export const clarityCheck: CheckDefinition = {
  id: "clarity",
  label: "Page structure",
  run({ facts }) {
    if (!facts) return notFetched("clarity");
    const result = {
      h1_count: facts.h1Count,
      skipped_heading_level: facts.skippedHeadingLevel,
      title_present: Boolean(facts.title),
      description_present: Boolean(facts.description),
      word_count: facts.wordCount,
      js_shell: facts.jsShell,
    };
    const evidence = firstH1(facts.headings);
    if (facts.jsShell) {
      return {
        id: "clarity",
        status: "fail",
        summary: `Only ${facts.wordCount} words in the HTML; the content appears to be rendered by JavaScript.`,
        facts: result,
        evidence,
      };
    }
    const issues: string[] = [];
    if (facts.h1Count !== 1) issues.push(`${facts.h1Count} h1 headings instead of 1`);
    if (facts.skippedHeadingLevel) issues.push("a skipped heading level");
    if (!facts.title) issues.push("no title");
    if (!facts.description) issues.push("no meta description");
    if (facts.wordCount < THIN_WORD_COUNT) issues.push(`only ${facts.wordCount} words`);
    if (issues.length === 0) {
      return {
        id: "clarity",
        status: "pass",
        summary: `One h1, no skipped heading levels, title and description present, ${facts.wordCount} words.`,
        facts: result,
        evidence,
      };
    }
    return { id: "clarity", status: "attention", summary: `Structure issues: ${issues.join(", ")}.`, facts: result, evidence };
  },
};

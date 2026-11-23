import type { CheckDefinition } from "./types";
import { notFetched } from "./types";

/**
 * JSON-LD presence and validity (`blocks` counts every block, valid or not). Pass: at least one block, none invalid,
 * and at least one @type. Attention: an invalid block, blocks without any @type (e.g. `{}` or `[]`), or no JSON-LD at
 * all. Evidence: the types found, or null when none.
 */
export const structuredDataCheck: CheckDefinition = {
  id: "structured_data",
  label: "Structured data",
  run({ facts }) {
    if (!facts) return notFetched("structured_data");
    const { blocks, invalid, types } = facts.jsonLd;
    const result = { blocks, invalid_blocks: invalid, types };
    const evidence = types.length > 0 ? types.join(", ") : null;
    if (invalid > 0) {
      return {
        id: "structured_data",
        status: "attention",
        summary: `${invalid} of ${blocks} JSON-LD block(s) are invalid JSON and are ignored.`,
        facts: result,
        evidence,
      };
    }
    if (blocks > 0 && types.length === 0) {
      return {
        id: "structured_data",
        status: "attention",
        summary: `${blocks} JSON-LD block(s), but no types declared (no @type).`,
        facts: result,
        evidence: null,
      };
    }
    if (blocks > 0) {
      return {
        id: "structured_data",
        status: "pass",
        summary: `${blocks} JSON-LD block(s), types: ${types.join(", ")}.`,
        facts: result,
        evidence,
      };
    }
    return { id: "structured_data", status: "attention", summary: "No JSON-LD found on the page.", facts: result, evidence: null };
  },
};

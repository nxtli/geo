import type { CheckDefinition } from "./types";
import { notMeasured } from "./types";

/** Placeholder: mentions of the brand outside its own site need an off-page source. */
export const externalCheck: CheckDefinition = {
  id: "external",
  label: "External mentions",
  run: () => notMeasured("external", "Mentions outside the site"),
};

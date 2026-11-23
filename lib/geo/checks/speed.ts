import type { CheckDefinition } from "./types";
import { notMeasured } from "./types";

/** Placeholder: page speed needs a real browser measurement, which this endpoint does not do. */
export const speedCheck: CheckDefinition = {
  id: "speed",
  label: "Page speed",
  run: () => notMeasured("speed", "Page speed"),
};

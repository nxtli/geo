// Bouwt prototype/index.html uit prototype/src.html en de kennisbank, zodat
// het prototype dezelfde criteria en aannames toont als de scan.
import { readFileSync, writeFileSync } from "node:fs";
const u = (p) => new URL(p, import.meta.url);
const src = readFileSync(u("../prototype/src.html"), "utf8");
const json = (p) => JSON.stringify(JSON.parse(readFileSync(u(p), "utf8"))).replace(/</g, "\\u003c");
const out = src
  .replace("/*__SCORECARD__*/null", () => json("../lib/geo/knowledge/scorecard.json"))
  .replace("/*__EVIDENCE__*/null", () => json("../lib/geo/knowledge/evidence.json"));
writeFileSync(u("../prototype/index.html"), out);
console.log("prototype/index.html gebouwd");

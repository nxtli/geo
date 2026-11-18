// Genereert de naslag van de skill uit de kennisbank, zodat app en skill
// dezelfde criteria en aannames gebruiken. Draai: npm run build:skill
import { readFileSync, writeFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const ev = read("../lib/geo/knowledge/evidence.json");
const sc = read("../lib/geo/knowledge/scorecard.json");
const byId = Object.fromEntries(ev.items.map((e) => [e.id, e]));
const OWNER = { schrijver: "Martine (tekst)", developer: "Webbouwer", mens: "Marketeer" };
const note = "<!-- Gegenereerd uit lib/geo/knowledge/*.json. Niet met de hand wijzigen. -->\n\n";

let b = `${note}# Bewijsbasis GEO\n\nVersie ${ev.version}. Herzien op ${ev.reviewed}. Volgende herziening voor ${ev.review_before}.\n\n`;
b += "Elke aanname in de scan staat hier, met bewijskracht, voorbehoud en bron. Een advies mag niet stelliger zijn dan zijn bewijskracht. Noem in adviezen geen percentages of beloofde stijgingen.\n\n## Bewijskracht\n\n";
for (const [g, d] of Object.entries(ev.grades)) b += `- **${g}**: ${d}\n`;
b += "\n## Aannames\n";
for (const e of ev.items) {
  b += `\n### ${e.id} (${e.grade})\n\n${e.claim}\n\n`;
  if (e.caveat) b += `Voorbehoud: ${e.caveat}\n\n`;
  b += `Herzien als: ${e.revise_if}\n\n`;
  b += e.sources.map((s) => `- [${s.title}](${s.url}), ${s.year}`).join("\n") + "\n";
}
b += "\n## Aanscherpen\n\n1. Wijzig `lib/geo/knowledge/evidence.json` (aanname, bewijskracht, bron).\n2. Pas zo nodig punten of criteria aan in `scorecard.json`. Verhoog dan `version`.\n3. Zet `reviewed` en `review_before` op de nieuwe data.\n4. Draai `npm test` en `npm run build:skill`.\n";
writeFileSync(new URL("../skills/geo-page-checker/references/bewijsbasis.md", import.meta.url), b);

let s = `${note}# Scorecard GEO (versie ${sc.version})\n\nBeoordeel elk criterium met **voldoet**, **deels**, **niet** of **niet te beoordelen**. Gok niet: wat je niet kunt zien, is niet te beoordelen en telt niet mee. Geef bij elk oordeel een letterlijk citaat van de pagina.\n\n`;
s += `## Poortwachters (geen punten)\n\nFaalt er één, dan is de score hooguit ${sc.blocked_cap} en begint het advies hier.\n\n`;
for (const g of sc.gates) s += `- **${g.id}. ${g.name}.** Klaar als: ${g.done_when} (${g.evidence.join(", ")})\n`;
for (const d of sc.dimensions) {
  const max = d.criteria.reduce((a, c) => a + c.max, 0);
  s += `\n## ${d.label} (${max} punten)\n\n| Id | Criterium | Punten | Bewijs | Wie | Advies | Klaar als |\n|---|---|---|---|---|---|---|\n`;
  for (const c of d.criteria) {
    const grades = c.evidence.map((id) => `${id} (${byId[id].grade})`).join(", ");
    s += `| ${c.id} | ${c.name} | ${c.max} | ${grades} | ${OWNER[c.owner]} | ${c.fix} | ${c.done_when} |\n`;
  }
}
s += "\n## Hygiëne (melden, geen punten)\n\n";
for (const h of sc.hygiene) s += `- **${h.name}**: ${byId[h.evidence[0]].claim}\n`;
s += "\n## Rekenregels\n\n- Voldoet = alle punten, deels = de helft, niet = nul.\n- Niet te beoordelen telt niet mee. De score wordt berekend over de rest.\n- Prioriteit van een advies = verloren punten × bewijskracht (feit en sterk 1,0, middel 0,7, richtlijn 0,5, zwak 0,4).\n- De score meet de geschiktheid van de pagina. Hij zegt niet hoe vaak een AI-tool het merk noemt of aanbeveelt.\n";
s += "\n## Vorm van een advies\n\nElk advies heeft zeven onderdelen:\n\n1. **Actie**: de handeling, specifiek voor deze pagina.\n2. **Waarom**: wat je zag.\n3. **Waar**: de kop of alinea.\n4. **Nu**: de huidige tekst, letterlijk.\n5. **Voorstel**: plak-klare tekst. Ontbrekende feiten als `[invullen: ...]`. Verzin geen feiten.\n6. **Wie**: de eigenaar uit de tabel.\n7. **Klaar als**: de toets uit de tabel.\n";
writeFileSync(new URL("../skills/geo-page-checker/references/geo-checklist.md", import.meta.url), s);
console.log("skill-naslag bijgewerkt");

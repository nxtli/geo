import { describe, expect, it } from "vitest";
import { needsCharlieReply } from "../charlie";
import { buildCharlieSystemPrompt, buildCharlieUserPrompt, parseCharlieReply } from "../charlie-reply";
import { BRANDS } from "../brand";

describe("needsCharlieReply", () => {
  it("herkent een vraag en een verzoek om hulp", () => {
    expect(needsCharlieReply("AI-sprekers Nederland. Heb je zelf nog andere suggesties?")).toBe(true);
    expect(needsCharlieReply("geen idee eigenlijk")).toBe(true);
    expect(needsCharlieReply("Kun je een voorbeeld geven")).toBe(true);
  });
  it("laat een gewoon antwoord met rust", () => {
    expect(needsCharlieReply("Sanne de Vries")).toBe(false);
    expect(needsCharlieReply("mkb-ondernemers in de bouw")).toBe(false);
    expect(needsCharlieReply("Wij helpen bedrijven met boekhouden")).toBe(false);
  });
});

describe("parseCharlieReply", () => {
  it("leest JSON, ook met tekst eromheen", () => {
    const r = parseCharlieReply('Hier: {"reply":"Drie ideeën: a, b, c. Zal ik ze toevoegen?","value":"AI-sprekers Nederland","done":false}');
    expect(r).toEqual({ reply: "Drie ideeën: a, b, c. Zal ik ze toevoegen?", value: "AI-sprekers Nederland", done: false });
  });
  it("geeft klaar zonder waarde door, de chat beslist of dat mag", () => {
    const r = parseCharlieReply('{"reply":"Prima, die slaan we over.","value":null,"done":true}');
    expect(r).toEqual({ reply: "Prima, die slaan we over.", value: null, done: true });
  });
  it("vervangt gedachtestreepjes en weigert rommel", () => {
    expect(parseCharlieReply('{"reply":"Goed — ik noteer het.","value":"x","done":true}')?.reply).toBe("Goed, ik noteer het.");
    expect(parseCharlieReply("geen json")).toBeNull();
    expect(parseCharlieReply('{"reply":"","value":"x","done":true}')).toBeNull();
  });
});

describe("prompts", () => {
  it("noemt de rol van het merk en de vraag van de stap", () => {
    expect(buildCharlieSystemPrompt(BRANDS.mat)).toContain("CRO-specialist in het Marketing AI Team");
    const p = buildCharlieUserPrompt({
      step: "desired_queries",
      answer: "AI-sprekers Nederland. Suggesties?",
      pending: null,
      context: { company_name: "Voorbeeld BV", desired_queries: "niet tonen" },
    });
    expect(p).toContain("Op welke vragen, zoektermen of thema's");
    expect(p).toContain("company_name: Voorbeeld BV");
    expect(p).not.toContain("niet tonen");
    expect(p).toContain("<bericht>");
  });
  it("geeft Charlies vorige bericht mee, zodat een kort akkoord context heeft", () => {
    const p = buildCharlieUserPrompt({
      step: "desired_queries",
      answer: "prima",
      lastReply: "Ideeën: AI in marketing, GEO-scan. Mag ik die noteren?",
    });
    expect(p).toContain("Jouw vorige bericht bij deze stap:\nIdeeën: AI in marketing");
    expect(p).toContain("Deze stap is verplicht.");
    expect(buildCharlieUserPrompt({ step: "competitors", answer: "geen?" })).toContain("Deze stap is optioneel.");
  });
});

import { GEO_SYSTEM_PROMPT } from "../analysis/prompt";
import { CHARLIE_VOICE } from "../voice";
import { CHARLIE_STEPS, CHARLIE_COPY } from "../charlie";

describe("communicatierichtlijn", () => {
  it("staat in de chat en in de analyse", () => {
    expect(buildCharlieSystemPrompt(BRANDS.mat)).toContain(CHARLIE_VOICE);
    expect(GEO_SYSTEM_PROMPT).toContain(CHARLIE_VOICE);
    expect(GEO_SYSTEM_PROMPT).toContain("Volg daar de toon en de aanspreekvorm van de pagina zelf");
  });
  it("vaste teksten van de chat: geen uitroeptekens, geen gedachtestreepjes, geen 'homepage'", () => {
    const texts = [
      ...CHARLIE_STEPS.flatMap((s) => [s.prompt, s.ack ? s.ack("Sanne de Vries") : ""]),
      ...Object.values(CHARLIE_COPY).map((v) => (typeof v === "function" ? v("x@example.com") : v)),
      BRANDS.mat.charlie.intro,
      BRANDS.nxtli.charlie.intro,
    ];
    for (const t of texts) {
      expect(t).not.toMatch(/[!—–]/);
      expect(t.toLowerCase()).not.toContain("homepage");
    }
  });
});

import { isFiller } from "../charlie";

describe("isFiller", () => {
  it("herkent woorden om door te gaan", () => {
    for (const w of ["ga door", "Ga maar door.", "prima", "ok", "oké", "verder", "geen idee"]) expect(isFiller(w)).toBe(true);
  });
  it("laat echte antwoorden met rust", () => {
    for (const w of ["goede boekhoudsoftware", "ja, AI in marketing", "prima koffie voor kantoren"]) expect(isFiller(w)).toBe(false);
  });
});

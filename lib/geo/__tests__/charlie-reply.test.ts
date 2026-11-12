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
  it("is nooit klaar zonder waarde", () => {
    expect(parseCharlieReply('{"reply":"Dat is nodig voor je rapport.","value":null,"done":true}')?.done).toBe(false);
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
});

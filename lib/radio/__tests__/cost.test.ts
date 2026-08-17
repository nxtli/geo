/**
 * Kostenmeter.
 *
 * Deze cijfers gaan over echt geld, dus de tests controleren vooral of de
 * PRIJSSTRUCTUUR klopt: cache-reads zijn een tiende, cache-writes een kwart
 * duurder, webzoekopdrachten kosten per stuk, en een euro-bedrag mag nooit
 * "€ 0,00" tonen terwijl er wel kosten zijn.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  DEFAULT_EUR_PER_USD,
  estimateDiscoveryUsd,
  estimateResearchUsd,
  eurPerUsd,
  formatCost,
  formatEur,
  formatUsd,
  usdToEur,
} from "../cost";
import { callCostUsd, costUsd, WEB_SEARCH_COST_USD } from "../../geo/pricing";

const originalRate = process.env.RADIO_EUR_PER_USD;

afterEach(() => {
  if (originalRate === undefined) delete process.env.RADIO_EUR_PER_USD;
  else process.env.RADIO_EUR_PER_USD = originalRate;
});

describe("callCostUsd", () => {
  it("rekent input en output tegen de modelprijs", () => {
    const usd = callCostUsd({
      model: "claude-sonnet-5",
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(usd).toBeCloseTo(3 + 15, 6);
  });

  it("rekent een cache-read als een tiende van de inputprijs", () => {
    const cached = callCostUsd({
      model: "claude-sonnet-5",
      cache_read_input_tokens: 1_000_000,
    });
    expect(cached).toBeCloseTo(0.3, 6);
  });

  it("rekent een cache-write als 1,25× de inputprijs", () => {
    const written = callCostUsd({
      model: "claude-sonnet-5",
      cache_creation_input_tokens: 1_000_000,
    });
    expect(written).toBeCloseTo(3.75, 6);
  });

  it("maakt caching pas vanaf de tweede call goedkoper", () => {
    // 1,25× betalen om daarna 0,1× te betalen: dat verdient zich terug zodra de
    // prompt een tweede keer gebruikt wordt. Dat is de hele reden om te cachen.
    const tokens = 3_000;
    const zonder = 2 * callCostUsd({ model: "claude-sonnet-5", input_tokens: tokens });
    const met =
      callCostUsd({ model: "claude-sonnet-5", cache_creation_input_tokens: tokens }) +
      callCostUsd({ model: "claude-sonnet-5", cache_read_input_tokens: tokens });
    expect(met).toBeLessThan(zonder);
  });

  it("rekent webzoekopdrachten per stuk", () => {
    const usd = callCostUsd({ model: "claude-sonnet-5", web_searches: 5 });
    expect(usd).toBeCloseTo(5 * WEB_SEARCH_COST_USD, 6);
  });

  it("is gelijk aan costUsd als er geen cache en geen zoekopdrachten zijn", () => {
    const usage = { model: "claude-opus-5", input_tokens: 12_000, output_tokens: 2_000 };
    expect(callCostUsd(usage)).toBeCloseTo(
      costUsd(usage.model, usage.input_tokens, usage.output_tokens),
      9,
    );
  });

  it("kost niets bij een leeg verbruik", () => {
    expect(callCostUsd({ model: "claude-sonnet-5" })).toBe(0);
  });

  it("maakt Sonnet goedkoper dan Opus bij hetzelfde verbruik", () => {
    const usage = { input_tokens: 60_000, output_tokens: 4_000 };
    expect(callCostUsd({ model: "claude-sonnet-5", ...usage })).toBeLessThan(
      callCostUsd({ model: "claude-opus-5", ...usage }),
    );
  });
});

describe("euro-weergave", () => {
  it("gebruikt de vaste koers als er geen env-variabele is", () => {
    delete process.env.RADIO_EUR_PER_USD;
    expect(eurPerUsd()).toBe(DEFAULT_EUR_PER_USD);
    expect(usdToEur(10)).toBeCloseTo(10 * DEFAULT_EUR_PER_USD, 6);
  });

  it("neemt een koers uit de omgeving over, ook met een komma", () => {
    process.env.RADIO_EUR_PER_USD = "0,85";
    expect(eurPerUsd()).toBeCloseTo(0.85, 6);
  });

  it("negeert een onzinnige koers in plaats van een verkeerd bedrag te tonen", () => {
    for (const bad of ["0", "-1", "abc", "999"]) {
      process.env.RADIO_EUR_PER_USD = bad;
      expect(eurPerUsd(), bad).toBe(DEFAULT_EUR_PER_USD);
    }
  });

  it("toont een klein bedrag nooit als nul", () => {
    delete process.env.RADIO_EUR_PER_USD;
    expect(formatEur(0.000001)).toBe("< € 0,01");
    expect(formatUsd(0.000001)).toBe("< $0.01");
  });

  it("toont nul als nul", () => {
    expect(formatEur(0)).toBe("€ 0,000");
  });

  it("geeft kleine bedragen extra decimalen", () => {
    delete process.env.RADIO_EUR_PER_USD;
    expect(formatEur(0.05)).toMatch(/^€ 0,\d{3}$/);
    expect(formatEur(50)).toMatch(/^€ \d+,\d{2}$/);
  });

  it("zet euro's en dollars naast elkaar, zodat de factuur te checken is", () => {
    expect(formatCost(1)).toContain("€");
    expect(formatCost(1)).toContain("$");
  });
});

describe("schatting vooraf", () => {
  it("schaalt mee met het aantal zoekopdrachten", () => {
    const klein = estimateDiscoveryUsd({
      perQuery: 10,
      searches: 3,
      searchModel: "claude-sonnet-5",
      formatModel: "claude-sonnet-5",
    });
    const groot = estimateDiscoveryUsd({
      perQuery: 40,
      searches: 8,
      searchModel: "claude-sonnet-5",
      formatModel: "claude-sonnet-5",
    });
    expect(groot).toBeGreaterThan(klein);
  });

  it("houdt een zoekrichting onder een dubbeltje bij Sonnet", () => {
    // Als deze grens sneuvelt is er iets aan het model of aan het zoekbudget
    // veranderd, en dan hoort iemand daar bewust naar te kijken.
    const usd = estimateDiscoveryUsd({
      perQuery: 25,
      searches: 5,
      searchModel: "claude-sonnet-5",
      formatModel: "claude-sonnet-5",
    });
    expect(usd).toBeLessThan(0.3);
  });

  it("maakt research per bedrijf goedkoper in een grotere batch", () => {
    const een = estimateResearchUsd(1, "claude-sonnet-5");
    const tien = estimateResearchUsd(10, "claude-sonnet-5");
    expect(tien / 10).toBeLessThan(een);
  });

  it("kost niets bij nul bedrijven", () => {
    expect(estimateResearchUsd(0, "claude-sonnet-5")).toBe(0);
    expect(estimateResearchUsd(-5, "claude-sonnet-5")).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { filterFromSearchParams, sortFromSearchParams } from "../query";
import { DEFAULT_SORT } from "../filters";

describe("filterFromSearchParams", () => {
  it("geeft een leeg filter zonder parameters", () => {
    expect(filterFromSearchParams({})).toEqual({});
  });

  it("leest tier, status en segment", () => {
    expect(filterFromSearchParams({ tier: "A" }).tiers).toEqual(["A"]);
    expect(filterFromSearchParams({ status: "Contacted" }).statuses).toEqual(["Contacted"]);
    expect(filterFromSearchParams({ segment: "automotive" }).segments).toEqual(["automotive"]);
  });

  it("negeert onbekende waarden in plaats van te crashen", () => {
    expect(filterFromSearchParams({ tier: "Z" }).tiers).toBeUndefined();
    expect(filterFromSearchParams({ status: "Bestaatniet" }).statuses).toBeUndefined();
    expect(filterFromSearchParams({ segment: "ruimtevaart" }).segments).toBeUndefined();
  });

  it("leest de vrije tekstvelden en trimt ze", () => {
    const filter = filterFromSearchParams({
      industry: "  supermarkt ",
      angle: " recruitment",
      location: "Utrecht ",
      q: " coolblue ",
    });
    expect(filter.industry).toBe("supermarkt");
    expect(filter.angle).toBe("recruitment");
    expect(filter.location).toBe("Utrecht");
    expect(filter.search).toBe("coolblue");
  });

  it("negeert lege tekstvelden", () => {
    expect(filterFromSearchParams({ q: "   " }).search).toBeUndefined();
  });

  it("leest numerieke drempels en klemt ze op 0-100", () => {
    expect(filterFromSearchParams({ min_priority: "70" }).minPriority).toBe(70);
    expect(filterFromSearchParams({ min_fit: "999" }).minFit).toBe(100);
    expect(filterFromSearchParams({ min_trigger: "-5" }).minTrigger).toBe(0);
  });

  it("negeert onbruikbare getallen", () => {
    expect(filterFromSearchParams({ min_fit: "abc" }).minFit).toBeUndefined();
    expect(filterFromSearchParams({ min_fit: "" }).minFit).toBeUndefined();
  });

  it("leest de ja/nee-filters", () => {
    expect(filterFromSearchParams({ contact: "yes" }).hasContact).toBe(true);
    expect(filterFromSearchParams({ contact: "no" }).hasContact).toBe(false);
    expect(filterFromSearchParams({ contact: "misschien" }).hasContact).toBeUndefined();
    expect(filterFromSearchParams({ linkedin: "yes" }).hasLinkedIn).toBe(true);
  });

  it("leest de schakelaars", () => {
    expect(filterFromSearchParams({ low_confidence: "1" }).lowConfidenceOnly).toBe(true);
    expect(filterFromSearchParams({ hide_demo: "1" }).includeDemo).toBe(false);
    expect(filterFromSearchParams({}).includeDemo).toBeUndefined();
  });

  it("pakt de eerste waarde als een parameter dubbel voorkomt", () => {
    expect(filterFromSearchParams({ tier: ["B", "A"] }).tiers).toEqual(["B"]);
  });
});

describe("sortFromSearchParams", () => {
  it("valt terug op priority aflopend", () => {
    expect(sortFromSearchParams({})).toEqual(DEFAULT_SORT);
    expect(sortFromSearchParams({ sort: "onzin" })).toEqual(DEFAULT_SORT);
    expect(sortFromSearchParams({ sort: "onzin-xyz" })).toEqual(DEFAULT_SORT);
  });

  it("leest key en richting", () => {
    expect(sortFromSearchParams({ sort: "fit-desc" })).toEqual({ key: "fit", direction: "desc" });
    expect(sortFromSearchParams({ sort: "company-asc" })).toEqual({
      key: "company",
      direction: "asc",
    });
  });

  it("behandelt een onbekende richting als aflopend", () => {
    expect(sortFromSearchParams({ sort: "fit-zijwaarts" })).toEqual({
      key: "fit",
      direction: "desc",
    });
  });
});

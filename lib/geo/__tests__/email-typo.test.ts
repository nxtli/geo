import { describe, expect, it } from "vitest";
import { suggestEmailFix } from "../email-typo";

describe("suggestEmailFix", () => {
  it("herkent tikfouten in bekende domeinen", () => {
    expect(suggestEmailFix("sanne@gmial.com")).toBe("sanne@gmail.com");
    expect(suggestEmailFix("sanne@hotmai.com")).toBe("sanne@hotmail.com");
    expect(suggestEmailFix("sanne@outlok.com")).toBe("sanne@outlook.com");
    expect(suggestEmailFix("Sanne.V@ziggo.n")).toBe("Sanne.V@ziggo.nl");
  });
  it("herkent een tikfout in de extensie", () => {
    expect(suggestEmailFix("info@bedrijf.con")).toBe("info@bedrijf.com");
    expect(suggestEmailFix("info@bedrijf.nll")).toBe("info@bedrijf.nl");
  });
  it("laat goede adressen met rust", () => {
    for (const ok of ["sanne@gmail.com", "info@bedrijf.nl", "a@hotmail.nl", "m@live.com", "x@marketingaiteam.com", "y@nxtli.com"]) {
      expect(suggestEmailFix(ok)).toBeNull();
    }
  });
});

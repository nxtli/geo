import { describe, expect, it } from "vitest";
import { isTestEmail, testEmails } from "../test-emails";

const env = (v?: string) => ({ GEO_TEST_EMAILS: v }) as unknown as NodeJS.ProcessEnv;

describe("testadressen", () => {
  it("kent standaard het beheerdersadres, ongeacht hoofdletters", () => {
    expect(isTestEmail(" Michiel@NXTLI.com ", env())).toBe(true);
    expect(isTestEmail("iemand@nxtli.com", env())).toBe(false);
  });
  it("leest een eigen lijst uit GEO_TEST_EMAILS", () => {
    expect(testEmails(env('"a@x.nl", B@y.nl'))).toEqual(["a@x.nl", "b@y.nl"]);
    expect(isTestEmail("michiel@nxtli.com", env("a@x.nl"))).toBe(false);
  });
  it("staat uit bij een lege waarde", () => {
    expect(isTestEmail("michiel@nxtli.com", env(""))).toBe(false);
  });
});

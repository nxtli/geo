import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regressietest voor de auth-gate in proxy.ts.
 *
 * Aanleiding: een em-dash in de realm-string maakte van het 401-antwoord een
 * 500. Headerwaarden zijn ByteStrings, dus alles buiten latin-1 laat de
 * Response-constructor gooien. Het effect is verraderlijk — de gate blokkeert
 * nog steeds, dus het lijkt te werken, maar de browser krijgt geen
 * WWW-Authenticate en niemand kan meer inloggen.
 *
 * De bron wordt als tekst gelezen in plaats van geïmporteerd: proxy.ts hangt aan
 * `next/server`, en dat wil je niet in een unit test optuigen.
 */
const source = readFileSync(resolve(process.cwd(), "proxy.ts"), "utf8");

describe("proxy auth", () => {
  it("gebruikt alleen ASCII in de 401-headers", () => {
    const block = source.match(
      /AUTH_CHALLENGE_HEADERS[^=]*=\s*\{([\s\S]*?)\n\};/,
    );
    expect(block, "AUTH_CHALLENGE_HEADERS niet gevonden in proxy.ts").not.toBeNull();

    for (const [index, char] of [...block![1]].entries()) {
      expect(
        char.charCodeAt(0),
        `teken "${char}" op positie ${index} valt buiten latin-1 en breekt het 401-antwoord`,
      ).toBeLessThan(256);
    }
  });

  it("stuurt een WWW-Authenticate-header mee, anders kan niemand inloggen", () => {
    expect(source).toMatch(/WWW-Authenticate/);
    expect(source).toMatch(/Basic realm=/);
  });

  it("dekt zowel de radio-tool als het admin-overzicht af", () => {
    const matcher = source.match(/matcher:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    expect(matcher).toContain("/admin");
    expect(matcher).toContain("/radio");
    expect(matcher).toContain("/api/radio/:path*");
  });

  it("laat de publieke GEO-routes ongemoeid", () => {
    const matcher = source.match(/matcher:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    expect(matcher).not.toContain("/api/geo");
    // Geen catch-all die per ongeluk de landingspagina afsluit.
    expect(matcher).not.toMatch(/"\/"|\/:path\*"\s*,?\s*\]/);
  });
});

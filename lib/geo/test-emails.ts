/**
 * Testadressen: e-mailadressen die de scan vaker dan één keer mogen doen.
 * Voor deze adressen geldt de regel "één scan per e-mailadres" niet. Elke scan
 * draait volledig en stuurt een nieuwe rapportmail. De dagelijkse limiet op het
 * totale aantal scans blijft wel gelden.
 *
 * Standaard staat het adres van de beheerder erin. Met GEO_TEST_EMAILS
 * (adressen gescheiden door een komma) vervang je de lijst. Een lege waarde
 * zet de uitzondering uit.
 */
const DEFAULT_TEST_EMAILS = "michiel@nxtli.com";

export function testEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.GEO_TEST_EMAILS ?? DEFAULT_TEST_EMAILS;
  return raw
    .split(",")
    .map((e) => e.trim().replace(/^["']|["']$/g, "").toLowerCase())
    .filter(Boolean);
}

export function isTestEmail(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return testEmails(env).includes(email.trim().toLowerCase());
}

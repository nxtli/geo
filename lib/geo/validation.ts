import { z } from "zod";

/**
 * Server-side validation for the GEO scan lead. The chat validates per-field
 * client-side too, but this is the authoritative gate in /api/geo/scan.
 */

const urlSchema = z
  .string()
  .trim()
  .min(1, "Vul je homepage-URL in.")
  .transform((value) => {
    // Be forgiving: accept "example.com" by defaulting to https://
    if (!/^https?:\/\//i.test(value)) return `https://${value}`;
    return value;
  })
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        (u.protocol === "http:" || u.protocol === "https:") &&
        u.hostname.includes(".")
      );
    } catch {
      return false;
    }
  }, "Dat lijkt geen geldige URL. Bijvoorbeeld: https://jouwbedrijf.nl");

const phoneSchema = z
  .string()
  .trim()
  .min(1, "Vul je telefoonnummer in.")
  .refine(
    (value) => normalizePhone(value) !== null,
    "Vul een geldig Nederlands 06-nummer in van 10 cijfers. Bijvoorbeeld: 06 12345678",
  );

export const geoLeadSchema = z.object({
  name: z.string().trim().min(2, "Vul je naam in.").max(120),
  email: z
    .string()
    .trim()
    .min(1, "Vul je e-mailadres in.")
    .email("Dat e-mailadres klopt niet helemaal. Probeer het nog eens."),
  phone: phoneSchema,
  job_title: z.string().trim().min(2, "Vul je functie in.").max(160),
  company_name: z.string().trim().min(1, "Vul je bedrijfsnaam in.").max(160),
  homepage_url: urlSchema,
  offer_description: z
    .string()
    .trim()
    .min(2, "Vertel kort wat je aanbiedt.")
    .max(2000),
  target_audience: z
    .string()
    .trim()
    .min(2, "Voor welke doelgroep wil je gevonden worden?")
    .max(2000),
  desired_queries: z
    .string()
    .trim()
    .min(2, "Noem een paar vragen of thema's.")
    .max(2000),
  competitors: z.string().trim().max(2000).optional().nullable(),
  consent: z.literal(true, {
    errorMap: () => ({ message: "We hebben je toestemming nodig om de scan uit te voeren." }),
  }),
});

export type GeoLeadParsed = z.infer<typeof geoLeadSchema>;

/** Lightweight, reusable single-field validators for the chat UI. */
export const fieldValidators = {
  email(value: string): string | null {
    const r = z.string().trim().email().safeParse(value);
    return r.success ? null : "Dat e-mailadres klopt niet helemaal. Probeer het nog eens.";
  },
  url(value: string): string | null {
    const r = urlSchema.safeParse(value);
    return r.success ? null : "Dat lijkt geen geldige URL. Bijvoorbeeld: https://jouwbedrijf.nl";
  },
  phone(value: string): string | null {
    const r = phoneSchema.safeParse(value);
    return r.success
      ? null
      : "Vul een geldig 06-nummer in van 10 cijfers. Bijvoorbeeld: 06 12345678";
  },
  required(value: string): string | null {
    return value.trim().length >= 2 ? null : "Dit veld mag niet leeg zijn.";
  },
};

/** Normalize a possibly-bare URL the same way the schema does. */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

/**
 * Normalize a Dutch mobile number to its canonical `06xxxxxxxx` form (10
 * digits). Accepts spacing/punctuation and the international `+31` / `0031`
 * prefixes (with an optional trunk `0`, e.g. `+31 (0)6…`). Returns null when the
 * input isn't a valid NL mobile number — landlines and foreign numbers fail.
 *
 * Single source of truth for both the form validation (phoneSchema) and the
 * value we persist, so stored numbers are always consistent.
 */
export function normalizePhone(value: string): string | null {
  // Keep digits and a leading plus only.
  let d = value.replace(/[^\d+]/g, "");
  // International → national: collapse +31 / 0031 (with optional trunk 0) to 0.
  d = d.replace(/^(?:\+31|0031)0?/, "0");
  // Must be a NL mobile: starts with 06 and is exactly 10 digits.
  return /^06\d{8}$/.test(d) ? d : null;
}

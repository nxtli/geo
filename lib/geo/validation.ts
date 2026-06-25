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

export const geoLeadSchema = z.object({
  name: z.string().trim().min(2, "Vul je naam in.").max(120),
  email: z
    .string()
    .trim()
    .min(1, "Vul je e-mailadres in.")
    .email("Dat e-mailadres klopt niet helemaal. Probeer het nog eens."),
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

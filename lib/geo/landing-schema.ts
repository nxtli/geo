import type { Brand } from "./brand";
import { LANDING_UPDATED, faqs } from "./landing";

/**
 * Gestructureerde gegevens (JSON-LD) van de landingspagina.
 *
 * Voor AI-citaties is geen effect van schema aangetoond (zie de kennisbank,
 * E-SCHEMA). Voor gewone zoekresultaten blijft het nuttig: het zegt eenduidig
 * wie de afzender is en wat de scan kost. De vragen komen uit dezelfde bron
 * als de zichtbare tekst, dus schema en pagina zeggen altijd hetzelfde.
 */
export function landingJsonLd(brand: Brand): Record<string, unknown> {
  const org = {
    "@type": "Organization",
    "@id": "https://nxtli.com/#organization",
    name: "NXTLI B.V.",
    url: "https://nxtli.com",
    foundingDate: "2017",
    founder: { "@type": "Person", name: "Michiel Schoonhoven", jobTitle: "Managing partner" },
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      org,
      {
        "@type": "WebPage",
        "@id": `${brand.siteUrl}/#webpage`,
        url: `${brand.siteUrl}/`,
        name: brand.meta.title,
        description: brand.meta.description,
        inLanguage: "nl-NL",
        dateModified: LANDING_UPDATED.iso,
        publisher: { "@id": org["@id"] },
      },
      {
        "@type": "WebApplication",
        name: brand.id === "mat" ? "GEO-scan van het Marketing AI Team" : brand.product,
        url: `${brand.siteUrl}/`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "nl-NL",
        description: brand.meta.description,
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        provider: { "@id": org["@id"] },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs(brand.name).map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

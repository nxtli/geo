import { Container } from "./primitives";

/**
 * ⚠️ PLACEHOLDER SOCIAL PROOF — replace before launch.
 * The count and testimonials below are EXAMPLE copy from the Neuroproof
 * analysis, not verified data. Using fabricated testimonials/numbers publicly
 * is a trust + legal risk. Swap in real quotes (with permission) and a real
 * count, or remove this section, before going live.
 */
const STAT = "Al 200+ ondernemers ontdekten hoe AI hun website beoordeelt.";

const TESTIMONIALS = [
  {
    quote:
      "In 10 minuten wist ik precies wat er mis was. Had ik jaren eerder willen weten.",
    name: "Lisa van den Berg",
    org: "eigenaar Studio Vorm",
  },
  {
    quote:
      "Mijn SEO was op orde, maar AI negeerde mijn website volledig. Nu niet meer.",
    name: "Joost Hermans",
    org: "Hermans Advies",
  },
  {
    quote:
      "Concrete tips, geen vaag rapport. Eindelijk een scan die écht iets zegt.",
    name: "Miriam de Groot",
    org: "De Groot Marketing",
  },
];

export function GeoSocialProof() {
  return (
    <section className="border-y border-border bg-elevated/40 py-12">
      <Container>
        <p className="text-center text-sm font-semibold uppercase tracking-[0.12em] text-subtle">
          {STAT}
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure
              key={t.name}
              className="rounded-2xl border border-border bg-surface p-6 shadow-soft"
            >
              <blockquote className="text-[15px] leading-relaxed text-ink">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-4 text-sm text-muted">
                <span className="font-semibold text-ink">{t.name}</span> — {t.org}
              </figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </section>
  );
}

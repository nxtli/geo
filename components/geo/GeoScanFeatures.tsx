import { Card, Container, SectionHeading } from "./primitives";
import { FEATURES } from "@/lib/geo/landing";

export function GeoScanFeatures() {
  return (
    <section id="wat-de-scan-beoordeelt" className="scroll-mt-24 bg-elevated/50 py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow={FEATURES.eyebrow} title={FEATURES.title} intro={FEATURES.intro} />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.items.map((f) => (
            <Card key={f.label}>
              <div
                className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                  f.weight === "Weegt zwaar"
                    ? "bg-brand text-brand-fg"
                    : f.weight === "Weegt gemiddeld"
                      ? "bg-brand-soft text-brand"
                      : "bg-elevated text-muted"
                }`}
              >
                {f.weight}
              </div>
              <h3 className="mt-3 font-display text-base font-semibold text-ink">{f.label}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </Card>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-base leading-relaxed text-muted">{FEATURES.gates}</p>
      </Container>
    </section>
  );
}

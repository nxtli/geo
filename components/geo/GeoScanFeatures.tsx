import { Card, Container, SectionHeading, SourceLink } from "./primitives";
import { FEATURES } from "@/lib/geo/landing";

const WEIGHT_STYLE: Record<string, string> = {
  "Weegt zwaar": "bg-brand text-brand-fg",
  "Weegt gemiddeld": "bg-brand-soft text-brand",
  "Weegt licht": "bg-elevated text-muted",
};

export function GeoScanFeatures() {
  return (
    <section id="wat-de-scan-beoordeelt" className="scroll-mt-24 bg-elevated/50 py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow={FEATURES.eyebrow} title={FEATURES.title} intro={FEATURES.intro} />

        <div className="mt-12 space-y-12">
          {FEATURES.steps.map((s) => (
            <div key={s.step}>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand">
                  Stap {s.step}
                </span>
                <h3 className="font-display text-xl font-semibold text-ink">{s.title}</h3>
              </div>
              <p className="mt-2 text-base text-muted">{s.intro}</p>

              <div className={`mt-6 grid gap-5 sm:grid-cols-2 ${s.items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
                {s.items.map((f) => (
                  <Card key={f.label}>
                    <div className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${WEIGHT_STYLE[f.weight]}`}>
                      {f.weight}
                    </div>
                    <h4 className="mt-3 font-display text-base font-semibold text-ink">{f.label}</h4>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-2xl text-center text-base leading-relaxed text-muted">{FEATURES.gates}</p>
        <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-muted">
          {FEATURES.weighting} <SourceLink source={FEATURES.weightingSource} />
        </p>
      </Container>
    </section>
  );
}

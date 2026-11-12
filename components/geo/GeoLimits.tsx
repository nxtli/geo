import { Container, SectionHeading, SourceLink } from "./primitives";
import { LIMITS } from "@/lib/geo/landing";

/** Wat de scan niet meet. Eigen standpunt, met bron per bewering. */
export function GeoLimits() {
  return (
    <section id="wat-de-scan-niet-meet" className="scroll-mt-24 py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow={LIMITS.eyebrow} title={LIMITS.title} intro={LIMITS.intro} />

        <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
          {LIMITS.items.map((i) => (
            <div key={i.title} className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
              <h3 className="font-display text-base font-semibold text-ink">{i.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{i.body}</p>
              <p className="mt-3 text-xs text-muted">
                <SourceLink source={i.source} />
              </p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-base leading-relaxed text-muted">
          {LIMITS.closing} <SourceLink source={LIMITS.closingSource} />
        </p>
      </Container>
    </section>
  );
}

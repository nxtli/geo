import { Container, SectionHeading } from "./primitives";
import { HOW } from "@/lib/geo/landing";

export function GeoHowItWorks() {
  return (
    <section id="hoe-het-werkt" className="scroll-mt-24 bg-elevated/50 py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow={HOW.eyebrow} title={HOW.title} intro={HOW.intro} />

        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {HOW.steps.map((s) => (
            <li key={s.n} className="bg-surface p-7">
              <div aria-hidden="true" className="font-display text-3xl font-bold text-brand/40">
                {s.n}
              </div>
              <h3 className="mt-3 font-display text-base font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

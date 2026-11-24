import { Container, SectionHeading, SourceLink } from "./primitives";
import { SearchIcon, SparkIcon } from "./icons";
import { PROBLEM } from "@/lib/geo/landing";

export function GeoProblem() {
  const [google, ai] = PROBLEM.cards;
  return (
    <section id="waarom" className="scroll-mt-24 py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow={PROBLEM.eyebrow} title={PROBLEM.title} intro={PROBLEM.intro} />

        <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-7 shadow-soft">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-elevated text-muted">
              <SearchIcon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">{google.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{google.body}</p>
          </div>

          <div className="rounded-2xl border border-brand/30 bg-brand-soft/50 p-7 shadow-soft">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-brand-fg">
              <SparkIcon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">{ai.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{ai.body}</p>
          </div>
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-base leading-relaxed text-muted">
          {PROBLEM.evidence} <SourceLink source={PROBLEM.source} />
        </p>
      </Container>
    </section>
  );
}

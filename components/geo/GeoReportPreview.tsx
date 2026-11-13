import { Container, SectionHeading } from "./primitives";
import { CheckIcon } from "./icons";
import { REPORT } from "@/lib/geo/landing";

/** Voorbeeld van het rapport. De gegevens zijn verzonnen en zo gelabeld. */
export function GeoReportPreview() {
  const ex = REPORT.example;
  return (
    <section id="rapport" className="scroll-mt-24 py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow={REPORT.eyebrow} title={REPORT.title} intro={REPORT.intro} />

        <div className="mx-auto mt-12 grid max-w-5xl items-start gap-8 lg:grid-cols-[1.25fr_0.75fr]">
          <figure className="overflow-hidden rounded-3xl border border-border bg-surface shadow-lift">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-gradient-to-r from-surface to-elevated/60 px-7 py-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">Voorbeeldrapport</div>
                <div className="mt-1 font-display text-lg font-semibold text-ink">{ex.domain}</div>
              </div>
              <div className="text-right">
                <div className="font-display text-4xl font-bold text-ink">
                  {ex.score}
                  <span className="text-lg text-muted">/100</span>
                </div>
                <div className="text-xs text-muted">Paginascore</div>
              </div>
            </div>

            <div className="space-y-6 p-7">
              <div>
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Opbouw van de score</div>
                <ul className="space-y-2.5">
                  {ex.bars.map((b) => (
                    <li key={b.label} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 text-sm">
                      <span className="text-ink">{b.label}</span>
                      <span className="font-semibold text-ink">
                        {b.got}/{b.max}
                      </span>
                      <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-elevated">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-brand to-accent"
                          style={{ width: `${Math.round((b.got / b.max) * 100)}%` }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-border bg-background/60 p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Advies 1</div>
                <div className="mt-1.5 font-display text-base font-semibold text-ink">{ex.action.title}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ex.action.chips.map((c) => (
                    <span key={c} className="rounded-full bg-elevated px-3 py-1 text-xs font-semibold text-muted">
                      {c}
                    </span>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-elevated/60 p-4">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Nu op de pagina</div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{ex.action.now}</p>
                  </div>
                  <div className="rounded-xl border-l-4 border-brand bg-brand-soft/60 p-4">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-brand">Voorstel</div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink">{ex.action.proposal}</p>
                  </div>
                </div>
                <p className="mt-4 flex items-start gap-2 text-sm text-muted">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>
                    <strong className="text-ink">Klaar als:</strong> {ex.action.done}
                  </span>
                </p>
              </div>
            </div>
            <figcaption className="border-t border-border px-7 py-3 text-xs text-muted">{REPORT.exampleNote}</figcaption>
          </figure>

          <div>
            <h3 className="font-display text-lg font-semibold text-ink">Dit staat erin</h3>
            <ul className="mt-4 space-y-3">
              {REPORT.includes.map((t) => (
                <li key={t} className="flex items-start gap-3 text-base text-ink">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                    <CheckIcon className="h-3.5 w-3.5" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}

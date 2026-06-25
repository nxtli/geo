import { Container, SectionHeading } from "./primitives";
import { CheckIcon } from "./icons";

export function GeoReportPreview() {
  return (
    <section className="bg-elevated/50 py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Voorbeeldrapport"
          title="Een helder NXTLI-rapport, geen vaag adviesdocument"
          intro="Je krijgt een concrete score, je sterke punten, gemiste kansen en een prioriteitenplan voor de komende 30 dagen."
        />

        <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-3xl border border-border bg-surface shadow-lift">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-gradient-to-r from-surface to-elevated/60 px-7 py-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                NXTLI GEO Scan
              </div>
              <div className="mt-1 font-display text-lg font-semibold text-ink">
                jouwbedrijf.nl
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-4xl font-bold text-success">
                72<span className="text-lg text-subtle">/100</span>
              </div>
              <div className="text-xs text-subtle">AI Visibility Score</div>
            </div>
          </div>

          <div className="grid gap-6 p-7 sm:grid-cols-2">
            <ReportBlock title="Samenvatting">
              <p className="text-sm leading-relaxed text-muted">
                Je expertise komt goed naar voren, maar AI mist concrete
                antwoorden op de vragen van je doelgroep.
              </p>
            </ReportBlock>

            <ReportBlock title="Sterke punten">
              <List
                items={[
                  "Duidelijk kernaanbod",
                  "Goede technische bereikbaarheid",
                ]}
              />
            </ReportBlock>

            <ReportBlock title="Gemiste kansen">
              <List
                items={[
                  "Weinig autoriteitssignalen",
                  "Geen gestructureerde FAQ",
                ]}
                muted
              />
            </ReportBlock>

            <ReportBlock title="Content gaps">
              <List
                items={[
                  "Antwoordpagina's per zoekvraag",
                  "Cases met concrete cijfers",
                ]}
                muted
              />
            </ReportBlock>

            <div className="sm:col-span-2">
              <ReportBlock title="Prioriteiten — komende 30 dagen">
                <ol className="space-y-2">
                  {[
                    "Herschrijf je homepage-intro naar een concreet aanbod-statement",
                    "Bouw een FAQ rond je belangrijkste zoekvragen",
                    "Voeg autoriteitssignalen toe (cases, cijfers, referenties)",
                  ].map((t, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-ink">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">
                        {i + 1}
                      </span>
                      {t}
                    </li>
                  ))}
                </ol>
              </ReportBlock>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function ReportBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-5">
      <div className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-subtle">
        {title}
      </div>
      {children}
    </div>
  );
}

function List({ items, muted }: { items: string[]; muted?: boolean }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2 text-sm text-muted">
          <CheckIcon
            className={`mt-0.5 h-4 w-4 shrink-0 ${muted ? "text-subtle" : "text-success"}`}
          />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

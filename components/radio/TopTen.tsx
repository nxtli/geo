import Link from "next/link";
import type { Prospect } from "@/lib/radio/types";
import { segmentLabel } from "@/lib/radio/segments";
import { tierDef } from "@/lib/radio/scoring";
import { ConfidenceBadge, DemoBadge, TierBadge } from "./primitives";

/**
 * De Top 10 — de vraag "wie moet Eric vandaag bellen?" in één blok.
 *
 * Bewust géén eigen ranglogica: dit is simpelweg de prospectlijst op Priority
 * Score, dezelfde sortering als de tabel. De rangschikking komt dus altijd uit de
 * scoring-engine, ook als de bedrijven via de zoekfunctie zijn binnengekomen.
 *
 * Per prospect staat er direct bij *waarom* hij hoog staat: de zwaarst wegende
 * trigger en de sterkste sales angle. Zonder die twee is een ranglijst een
 * getal zonder betekenis.
 */
export function TopTen({ prospects, limit = 10 }: { prospects: Prospect[]; limit?: number }) {
  const scored = prospects.filter((p) => p.priority_score !== null);
  const top = scored.slice(0, limit);

  if (top.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Top {limit}
        </h2>
        <p className="mt-2 text-sm text-muted">
          Er is nog niets gescoord.{" "}
          <Link href="/radio/zoeken" className="text-brand underline">
            Laat de tool bedrijven zoeken
          </Link>{" "}
          of{" "}
          <Link href="/radio/import" className="text-brand underline">
            voeg ze zelf toe
          </Link>
          , en start daarna het onderzoek.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
            Bel deze eerst — top {top.length}
          </h2>
          <p className="mt-0.5 text-xs text-subtle">
            Priority = Fit × 0,75 + Trigger × 0,25. De volledige ranglijst staat in de tabel
            hieronder.
          </p>
        </div>
        {scored.length > top.length ? (
          <Link href="/radio?sort=priority-desc" className="text-sm text-brand underline">
            Alle {scored.length} gescoorde prospects
          </Link>
        ) : null}
      </header>

      <ol className="divide-y divide-border">
        {top.map((p, index) => {
          const tier = p.tier ? tierDef(p.tier) : null;
          const angle = p.sales_angles[0] ?? null;
          const trigger = p.triggers[0] ?? null;

          return (
            <li key={p.id} className="flex gap-4 px-5 py-4">
              <div className="flex w-12 shrink-0 flex-col items-center">
                <span className="font-display text-2xl font-semibold tabular-nums text-ink">
                  {p.priority_score}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-subtle">
                  #{index + 1}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/radio/prospects/${p.id}`}
                    className="font-medium text-ink underline decoration-border hover:decoration-brand"
                  >
                    {p.company_name}
                  </Link>
                  <TierBadge tier={p.tier} />
                  {p.demo ? <DemoBadge /> : null}
                  <ConfidenceBadge score={p.research_confidence} label={p.confidence} />
                </div>

                <div className="mt-0.5 text-xs text-subtle">
                  {[
                    p.industry,
                    p.segment ? segmentLabel(p.segment) : null,
                    p.city,
                    `fit ${p.fit_score ?? "—"} · trigger ${p.trigger_score ?? "—"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>

                {trigger ? (
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-medium">Waarom nu:</span> {trigger.label}
                    {trigger.date ? (
                      <span className="text-subtle"> ({trigger.date})</span>
                    ) : (
                      <span className="text-subtle"> (datum onbekend)</span>
                    )}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    Geen concrete aanleiding gevonden — deze staat hoog op fit, niet op timing.
                  </p>
                )}

                {angle ? (
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    <span className="font-medium text-ink">Angle ({angle.kind}):</span>{" "}
                    {angle.angle}
                  </p>
                ) : null}

                {p.knockouts.length > 0 ? (
                  <p className="mt-1 text-xs text-warning">
                    Let op: {p.knockouts[0]}
                    {p.knockout_override ? " — bewust behouden." : ""}
                  </p>
                ) : null}

                <p className="mt-1.5 text-xs text-subtle">
                  {p.contact.first_name
                    ? `Contact: ${[p.contact.first_name, p.contact.last_name]
                        .filter(Boolean)
                        .join(" ")}${p.contact.title ? ` — ${p.contact.title}` : ""}${
                        p.contact.linkedin_url ? " · LinkedIn aanwezig" : " · geen LinkedIn-URL"
                      }`
                    : `Contact nog niet gevonden — benader ${
                        p.recommended_contact_role ?? "Head of Marketing"
                      }`}
                </p>
              </div>

              {tier ? (
                <div className="hidden w-24 shrink-0 text-right text-xs text-muted sm:block">
                  {tier.emoji} {tier.label}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

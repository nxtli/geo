import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProspect } from "@/lib/radio/store";
import { segmentLabel } from "@/lib/radio/segments";
import { provincesLabel } from "@/lib/radio/provinces";
import { sizeBandLabel } from "@/lib/radio/company-size";
import { tierDef } from "@/lib/radio/scoring";
import { TRIGGER_KIND_LABELS } from "@/lib/radio/scoring/triggers";
import { isReadyForWaalaxy } from "@/lib/radio/filters";
import { Shell } from "@/components/radio/Shell";
import { ProspectEditor } from "@/components/radio/ProspectEditor";
import { ResearchButton } from "@/components/radio/ResearchButton";
import {
  BasisBadge,
  Card,
  ConfidenceBadge,
  DemoBadge,
  ExternalLink,
  Notice,
  ScoreBlock,
  TierBadge,
} from "@/components/radio/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prospect — Adverteren op de Radio",
  robots: { index: false, follow: false },
};

function formatDate(iso: string | null): string {
  if (!iso) return "onbekend";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default async function ProspectDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prospect = await getProspect(id);
  if (!prospect) notFound();

  const contactName =
    [prospect.contact.first_name, prospect.contact.last_name].filter(Boolean).join(" ") || null;
  const ready = isReadyForWaalaxy(prospect);
  const tier = prospect.tier ? tierDef(prospect.tier) : null;

  return (
    <Shell
      title={prospect.company_name}
      subtitle={
        [
          prospect.industry,
          prospect.segment ? segmentLabel(prospect.segment) : null,
          [prospect.city, prospect.country].filter(Boolean).join(", ") || null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined
      }
      actions={<ResearchButton prospectId={prospect.id} hasScore={prospect.fit_score !== null} />}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/radio" className="text-sm text-brand underline">
            ← Terug naar alle prospects
          </Link>
          {prospect.demo ? <DemoBadge /> : null}
          {prospect.website ? (
            <ExternalLink href={prospect.website} className="text-sm">
              {prospect.website.replace(/^https?:\/\//, "")}
            </ExternalLink>
          ) : (
            <span className="text-sm text-subtle">geen website bekend</span>
          )}
        </div>

        {prospect.fit_score === null ? (
          <Notice tone="info">
            Dit bedrijf is nog niet onderzocht. Klik op <strong>Research &amp; Score</strong> om
            publieke bronnen op te halen en de scores te berekenen.
          </Notice>
        ) : null}

        {prospect.knockouts.length > 0 ? (
          <Notice tone={prospect.knockout_override ? "warn" : "error"}>
            <strong>
              {prospect.knockout_override
                ? "Knock-out gevonden, maar bewust behouden"
                : "Knock-out — op lage prioriteit gezet"}
            </strong>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {prospect.knockouts.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {prospect.knockout_override ? (
              <p className="mt-2">
                <strong>Reden om toch te behouden:</strong> {prospect.knockout_override}
              </p>
            ) : null}
          </Notice>
        ) : null}

        {prospect.research_confidence !== null && prospect.research_confidence < 40 ? (
          <Notice tone="warn">
            <strong>Lage research-confidence ({prospect.research_confidence}/100).</strong> Er is
            weinig hard bewijs gevonden; veel scores zijn een inschatting. Controleer de onderbouwing
            hieronder voordat je dit bedrijf belt.
          </Notice>
        ) : null}

        {/* Scores (§17) */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ScoreBlock
            label="Priority Score"
            value={prospect.priority_score}
            emphasis
            hint="Fit × 0,75 + Trigger × 0,25"
          />
          <ScoreBlock label="Fit Score" value={prospect.fit_score} hint="Past radio bij dit bedrijf?" />
          <ScoreBlock label="Trigger Score" value={prospect.trigger_score} hint="Waarom nú bellen?" />
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">Tier</div>
            <div className="mt-2">
              <TierBadge tier={prospect.tier} />
            </div>
            {tier ? <p className="mt-2 text-xs leading-snug text-muted">{tier.label}</p> : null}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted">Confidence</span>
              <ConfidenceBadge
                score={prospect.research_confidence}
                label={prospect.confidence}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {prospect.description ? (
              <Card title="Bedrijf">
                <p className="text-sm leading-relaxed text-ink">{prospect.description}</p>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <Detail label="Branche" value={prospect.industry} />
                  <Detail label="Segment" value={prospect.segment ? segmentLabel(prospect.segment) : null} />
                  <Detail label="Plaats" value={prospect.city} />
                  <Detail label="Land" value={prospect.country} />
                  <Detail
                    label="Bedrijfsgrootte"
                    value={prospect.company_size}
                    fallback="niet vastgesteld"
                  />
                  <Detail
                    label="Aantal vestigingen"
                    value={
                      prospect.number_of_locations !== null
                        ? String(prospect.number_of_locations)
                        : null
                    }
                    fallback="niet vastgesteld"
                  />
                  <Detail
                    label="Grootteklasse"
                    value={
                      prospect.size_band
                        ? `${sizeBandLabel(prospect.size_band)}${
                            prospect.size_band_basis === "inference" ? " (geschat)" : ""
                          }`
                        : null
                    }
                    fallback="niet vastgesteld"
                  />
                  <Detail
                    label="Verzorgingsgebied"
                    value={
                      prospect.coverage_provinces.length > 0
                        ? provincesLabel(prospect.coverage_provinces)
                        : null
                    }
                    fallback="niet vastgesteld"
                  />
                </dl>
              </Card>
            ) : null}

            {prospect.why_interesting.length > 0 ? (
              <Card title="Waarom interessant?">
                <ul className="space-y-2">
                  {prospect.why_interesting.map((bullet, index) => (
                    <li key={index} className="flex gap-2 text-sm leading-relaxed text-ink">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card title={`Triggers — waarom nu? (${prospect.triggers.length})`}>
              {prospect.triggers.length === 0 ? (
                <p className="text-sm text-muted">
                  Geen concrete aanleiding gevonden. Dat is een geldige uitkomst: er is bewust geen
                  trigger verzonnen. De Trigger Score is daarom {prospect.trigger_score ?? 0}.
                </p>
              ) : (
                <ul className="space-y-3">
                  {prospect.triggers.map((trigger, index) => (
                    <li key={index} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                          {TRIGGER_KIND_LABELS[trigger.kind]}
                        </span>
                        <span className="text-sm font-medium text-ink">{trigger.label}</span>
                        {trigger.weight !== undefined ? (
                          <span className="ml-auto text-xs text-subtle">
                            gewicht {trigger.weight}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted">
                        {trigger.explanation}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-subtle">
                        <span>
                          Datum: {trigger.date ?? "onbekend (weegt daarom lichter)"}
                        </span>
                        <span>Confidence: {trigger.confidence}</span>
                        <ExternalLink href={trigger.source_url} className="text-xs">
                          bron
                        </ExternalLink>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title={`Sales angles (${prospect.sales_angles.length})`}>
              {prospect.sales_angles.length === 0 ? (
                <p className="text-sm text-muted">Nog geen angles bepaald.</p>
              ) : (
                <ul className="space-y-3">
                  {prospect.sales_angles.map((angle, index) => (
                    <li key={index} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-ink">{angle.kind}</span>
                        <span className="text-xs text-muted">
                          strength {angle.strength}/10
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-ink">{angle.angle}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {prospect.fit_components.length > 0 ? (
              <Card title="Hoe de Fit Score is opgebouwd">
                <ul className="divide-y divide-border">
                  {prospect.fit_components.map((component) => (
                    <li key={component.key} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <span className="flex-1 text-sm font-medium text-ink">
                          {component.label}
                        </span>
                        <BasisBadge basis={component.basis} />
                        <span className="w-14 text-right text-sm tabular-nums text-ink">
                          {component.score} / {component.max}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full rounded-full bg-ink/40"
                          style={{ width: `${(component.score / component.max) * 100}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted">
                        {component.rationale}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 border-t border-border pt-3 text-sm font-medium text-ink">
                  Totaal: {prospect.fit_score} / 100
                </p>
              </Card>
            ) : null}

            <Card title={`Evidence — alle gebruikte bronnen (${prospect.evidence.length})`}>
              {prospect.evidence.length === 0 ? (
                <p className="text-sm text-muted">
                  Geen bronnen vastgelegd. Zonder bewijs blijft de research-confidence laag en
                  worden conclusies als inschatting behandeld.
                </p>
              ) : (
                <ul className="space-y-3">
                  {prospect.evidence.map((item, index) => (
                    <li key={index} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <ExternalLink href={item.url} className="text-sm font-medium">
                          {item.title}
                        </ExternalLink>
                        <span className="text-xs text-subtle">
                          {item.date ? formatDate(item.date) : "geen datum"} · {item.confidence}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{item.fact}</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-subtle">{item.url}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Rechterkolom */}
          <div className="space-y-6">
            <Card title="Contact">
              {contactName ? (
                <div className="space-y-1">
                  <p className="text-base font-semibold text-ink">{contactName}</p>
                  <p className="text-sm text-muted">
                    {prospect.contact.title ?? prospect.recommended_contact_role ?? "functie onbekend"}
                  </p>
                  {prospect.contact.linkedin_url ? (
                    <ExternalLink href={prospect.contact.linkedin_url} className="text-sm">
                      LinkedIn-profiel
                    </ExternalLink>
                  ) : (
                    <p className="text-sm text-warning">Nog geen LinkedIn-URL</p>
                  )}
                  {prospect.contact.source ? (
                    <p className="text-xs text-subtle">
                      Bron: {prospect.contact.source}
                      {prospect.contact.confidence ? ` · ${prospect.contact.confidence}` : ""}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-muted">
                    <strong className="text-ink">Contact person:</strong> not yet identified
                  </p>
                  <p className="text-sm text-muted">
                    <strong className="text-ink">Recommended role:</strong>{" "}
                    {prospect.recommended_contact_role ?? "Head of Marketing"}
                  </p>
                  <p className="mt-2 text-xs text-subtle">
                    Er wordt geen persoon gegokt. Vul hieronder een naam en LinkedIn-URL in als je
                    die hebt.
                  </p>
                </div>
              )}
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                  ready
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-warning/40 bg-warning/10 text-warning"
                }`}
              >
                {ready
                  ? "Klaar voor Waalaxy-export."
                  : "Nog niet klaar voor Waalaxy: naam én LinkedIn-profiel-URL nodig."}
              </div>
            </Card>

            {prospect.personalization ? (
              <Card title="Personalisatie">
                <dl className="space-y-2.5 text-sm">
                  <PersonalizationRow label="Reden" value={prospect.personalization.reason} />
                  <PersonalizationRow label="Trigger" value={prospect.personalization.trigger} />
                  <PersonalizationRow label="Observatie" value={prospect.personalization.observation} />
                  <PersonalizationRow label="Angle" value={prospect.personalization.angle} />
                </dl>
                {prospect.personalization.opening_question ? (
                  <div className="mt-4 rounded-lg border border-brand/30 bg-brand/5 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-brand">
                      Aanbevolen openingsvraag
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-ink">
                      &ldquo;{prospect.personalization.opening_question}&rdquo;
                    </p>
                  </div>
                ) : null}
              </Card>
            ) : null}

            <Card title="Bijwerken">
              <ProspectEditor prospect={prospect} />
            </Card>

            <Card title="Research">
              <dl className="space-y-2 text-sm">
                <Detail label="Laatst onderzocht" value={formatDate(prospect.date_researched)} />
                <Detail
                  label="Provider"
                  value={
                    prospect.research_provider === "heuristic"
                      ? "heuristiek (geen AI)"
                      : prospect.research_provider
                  }
                />
                <Detail label="Toegevoegd" value={formatDate(prospect.created_at)} />
              </dl>
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Detail({
  label,
  value,
  fallback = "—",
}: {
  label: string;
  value: string | null;
  fallback?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className={value ? "text-ink" : "text-subtle"}>{value ?? fallback}</dd>
    </div>
  );
}

function PersonalizationRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="leading-relaxed text-ink">{value}</dd>
    </div>
  );
}

import type { RunRecord } from "@/lib/radio/types";
import { formatEur, formatUsd } from "@/lib/radio/cost";

/**
 * Run-historie: wat er gedraaid heeft, wat het opleverde en wat het kostte.
 *
 * Server-component en bewust een verslag: de cijfers komen uit de run zelf en
 * worden niet opnieuw uit de huidige prospectlijst berekend. Een run van vorige
 * week hoort te laten zien wat er tóen gebeurde, ook als er daarna prospects
 * zijn verwijderd of opnieuw onderzocht.
 */
export function RunHistory({ runs }: { runs: RunRecord[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
        Er is nog niets gedraaid. Start een scan bij <strong className="text-ink">Zoeken</strong> of
        onderzoek bestaande prospects vanaf het dashboard — elke ronde komt hier automatisch te
        staan.
      </div>
    );
  }

  const totalUsd = runs.reduce((sum, run) => sum + run.cost_usd, 0);
  const totalAdded = runs.reduce((sum, run) => sum + run.added, 0);
  const totalSearches = runs.reduce((sum, run) => sum + run.searches, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Kosten (deze historie)" value={formatEur(totalUsd)} hint={formatUsd(totalUsd)} />
        <Stat label="Rondes" value={String(runs.length)} hint={`${totalSearches} webzoekopdrachten`} />
        <Stat
          label="Toegevoegd / onderzocht"
          value={String(totalAdded)}
          hint="som over alle rondes"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <Th>Wanneer</Th>
              <Th>Soort</Th>
              <Th>Instellingen</Th>
              <Th className="text-right">Resultaat</Th>
              <Th className="text-right">Zoek&shy;opdrachten</Th>
              <Th className="text-right">Tokens</Th>
              <Th className="text-right">Kosten</Th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-b border-border/60 align-top last:border-0">
                <Td>
                  <span className="whitespace-nowrap text-ink">{formatWhen(run.started_at)}</span>
                  <span className="mt-0.5 block text-xs text-subtle">
                    {durationLabel(run.started_at, run.finished_at)}
                  </span>
                </Td>
                <Td>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      run.kind === "discovery"
                        ? "bg-brand/10 text-brand"
                        : "bg-success/10 text-success"
                    }`}
                  >
                    {run.kind === "discovery" ? "Zoeken" : "Onderzoek"}
                  </span>
                </Td>
                <Td>
                  <span className="text-ink">{run.settings || "—"}</span>
                  {run.targets.length > 0 ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-subtle">
                        {run.kind === "discovery"
                          ? `${run.targets.length} zoekrichting${run.targets.length === 1 ? "" : "en"}`
                          : `${run.targets.length} bedrijven`}
                      </summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-muted">
                        {run.targets.map((target, index) => (
                          <li key={`${run.id}-${index}`}>{target}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {run.warnings.length > 0 ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-warning">
                        {run.warnings.length} melding{run.warnings.length === 1 ? "" : "en"}
                      </summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-muted">
                        {run.warnings.map((warning, index) => (
                          <li key={`${run.id}-w-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </Td>
                <Td className="text-right">
                  <span className="text-ink">
                    {run.added} {run.kind === "discovery" ? "nieuw" : "gescoord"}
                  </span>
                  {run.duplicates > 0 ? (
                    <span className="mt-0.5 block text-xs text-subtle">
                      {run.duplicates} al bekend
                    </span>
                  ) : null}
                  {run.skipped > 0 ? (
                    <span className="mt-0.5 block text-xs text-subtle">
                      {run.skipped} overgeslagen
                    </span>
                  ) : null}
                </Td>
                <Td className="text-right text-muted">{run.searches || "—"}</Td>
                <Td className="text-right text-muted">
                  <span className="whitespace-nowrap">{compact(run.input_tokens)} in</span>
                  <span className="mt-0.5 block whitespace-nowrap">
                    {compact(run.output_tokens)} uit
                  </span>
                  {run.cache_read_tokens > 0 ? (
                    <span className="mt-0.5 block whitespace-nowrap text-success">
                      {compact(run.cache_read_tokens)} uit cache
                    </span>
                  ) : null}
                </Td>
                <Td className="text-right">
                  <span className="font-medium text-ink">{formatEur(run.cost_usd)}</span>
                  <span className="mt-0.5 block text-xs text-subtle">
                    {formatUsd(run.cost_usd)}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-subtle">
        Bedragen zijn berekend uit de tokens die de API terugmeldde, met de prijzen uit
        lib/geo/pricing.ts en een vaste dollarkoers. Het zijn dus nauwkeurige schattingen, geen
        factuurregels — vergelijk ze met je Anthropic-verbruik als het bedrag telt.
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 ${className}`}>{children}</td>;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function durationLabel(from: string, to: string): string {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "";
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

/** 12.400 → "12,4k". Houdt de tokenkolom smal. */
function compact(value: number): string {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(1).replace(".", ",")}k`;
}

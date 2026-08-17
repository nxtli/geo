import type { Metadata } from "next";
import Link from "next/link";
import { listProspects, describeStore } from "@/lib/radio/store";
import { DEFAULT_SORT, computeStats, filterProspects, sortProspects } from "@/lib/radio/filters";
import { filterFromSearchParams, sortFromSearchParams, type SearchParams } from "@/lib/radio/query";
import { describeResearchProvider } from "@/lib/radio/research";
import { Shell } from "@/components/radio/Shell";
import { Filters } from "@/components/radio/Filters";
import { ProspectTable } from "@/components/radio/ProspectTable";
import { TopTen } from "@/components/radio/TopTen";
import { DashboardActions } from "@/components/radio/DashboardActions";
import { Notice, Stat } from "@/components/radio/primitives";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Interne tool: nooit indexeren.
export const metadata: Metadata = {
  title: "Prospect Finder — Adverteren op de Radio",
  robots: { index: false, follow: false },
};

export default async function RadioDashboard({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let all: Awaited<ReturnType<typeof listProspects>> = [];
  let loadError: string | null = null;
  try {
    all = await listProspects();
  } catch (error) {
    logError("radio.dashboard", error);
    loadError =
      error instanceof Error ? error.message : "De prospectlijst kon niet worden geladen.";
  }

  const stats = computeStats(all);
  const filtered = sortProspects(
    filterProspects(all, filterFromSearchParams(params)),
    sortFromSearchParams(params),
  );

  const provider = describeResearchProvider();

  return (
    <Shell
      title="Prospects"
      subtitle="FIT × TIMING — welke bedrijven zijn nú interessant voor een gesprek over radio?"
      actions={<DashboardActions unresearchedCount={stats.notResearched} demoCount={stats.demo} />}
      storeLabel={describeStore()}
      providerLabel={
        provider.ai
          ? `${provider.id} (AI)`
          : `${provider.id} — trefwoord-heuristiek, geen AI-analyse`
      }
    >
      <div className="space-y-6">
        {loadError ? (
          <Notice tone="error">
            <strong>De prospectlijst kon niet worden geladen.</strong>
            <div className="mt-1 font-mono text-xs">{loadError}</div>
            <div className="mt-2">
              Draait de tool op Postgres? Controleer de connectiestring, of zet{" "}
              <code className="rounded bg-background px-1">RADIO_STORE_DRIVER=file</code> om lokaal
              met een JSON-bestand te werken.
            </div>
          </Notice>
        ) : null}

        {!provider.ai ? (
          <Notice tone="warn">
            Er is geen <code className="rounded bg-background px-1">ANTHROPIC_API_KEY</code>{" "}
            geconfigureerd, dus de research draait op de trefwoord-heuristiek. Die werkt, maar
            beoordeelt oppervlakkiger en zet vrijwel alles op &quot;inschatting&quot; — de
            research-confidence valt daardoor lager uit.
          </Notice>
        ) : null}

        {/* Dashboard (§16) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Prospects" value={String(stats.total)} sub={`${stats.notResearched} nog niet onderzocht`} />
          <Stat label="Tier A 🔥" value={String(stats.tierA)} tone="good" sub="zeer interessant" />
          <Stat label="Tier B 🟢" value={String(stats.tierB)} sub="goede prospect" />
          <Stat
            label="Ready for Waalaxy"
            value={String(stats.readyForWaalaxy)}
            tone={stats.readyForWaalaxy > 0 ? "good" : "default"}
            sub="contact + LinkedIn-profiel"
          />
          <Stat
            label="Missing contact"
            value={String(stats.missingContact)}
            tone={stats.missingContact > 0 ? "warn" : "default"}
            sub={`${stats.missingLinkedIn} zonder LinkedIn`}
          />
          <Stat
            label="Gemiddelde scores"
            value={stats.avgFit === null ? "—" : `${stats.avgFit} fit`}
            sub={stats.avgTrigger === null ? "nog geen research" : `${stats.avgTrigger} trigger`}
          />
        </div>

        {stats.lowConfidence > 0 ? (
          <Notice tone="warn">
            {stats.lowConfidence} prospect{stats.lowConfidence === 1 ? "" : "s"} met lage
            research-confidence (&lt; 40/100): daar is te weinig hard bewijs voor gevonden.{" "}
            <Link href="/radio?low_confidence=1" className="underline">
              Bekijk ze
            </Link>
            .
          </Notice>
        ) : null}

        {stats.demo > 0 ? (
          <Notice tone="info">
            Er staan {stats.demo} <strong>DEMO DATA</strong>-prospects in de lijst (fictieve
            bedrijven op <code className="rounded bg-surface px-1">.invalid</code>-domeinen). Verwijder
            ze zodra je met echte bedrijven gaat werken.
          </Notice>
        ) : null}

        {/* Top 10 staat boven de tabel en negeert de filters: dit is de vraag
            "wie bel ik vandaag?", altijd over de volledige lijst. */}
        <TopTen prospects={sortProspects(all, DEFAULT_SORT)} />

        <Filters resultCount={filtered.length} totalCount={all.length} />

        <ProspectTable prospects={filtered} />
      </div>
    </Shell>
  );
}

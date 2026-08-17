"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Notice } from "./primitives";
import { RADIO_SEGMENTS } from "@/lib/radio/segments";

interface QueryOption {
  key: string;
  label: string;
  kind: "fit" | "timing";
  segment: string | null;
  searches: string[];
}

interface DiscoverySummary {
  added: Array<{ id: string; company_name: string; website: string | null; query: string }>;
  duplicates: string[];
  unreachable: string[];
  withoutTrigger: string[];
  rejectedSources: string[];
  queriesUsed: Array<{ key: string; label: string; found: number; searches: number }>;
  warnings: string[];
  costUsd: number;
  searchesRun: number;
}

interface Option {
  key: string;
  label: string;
  mkb?: boolean;
}

interface Estimate {
  per_query: number;
  searches_per_direction: number;
  per_direction_usd: number;
  per_direction_label: string;
  per_company_usd: number;
  per_company_label: string;
  search_model: string;
  research_model: string;
  eur_per_usd: number;
}

type TriggerMode = "any" | "required" | "none";

/**
 * Koers als de server hem nog niet heeft meegegeven. Alleen een fallback voor
 * het eerste renderframe — de echte koers komt uit lib/radio/cost.ts, zodat de
 * bedragen in de UI en in de historie niet uit elkaar kunnen lopen.
 */
const FALLBACK_EUR_PER_USD = 0.92;

/** Bedrag in euro's. Kleine bedragen krijgen extra decimalen. */
function euro(usd: number, rate: number): string {
  const value = (usd || 0) * rate;
  if (value > 0 && value < 0.01) return "< € 0,01";
  return `€ ${value.toFixed(value < 1 ? 3 : 2).replace(".", ",")}`;
}

const TRIGGER_MODES: Array<{ key: TriggerMode; label: string; hint: string }> = [
  {
    key: "any",
    label: "Mag, hoeft niet",
    hint: "Aanleiding wordt meegenomen als de bron er een noemt.",
  },
  {
    key: "required",
    label: "Verplicht",
    hint: "Alleen bedrijven met een concrete, recente aanleiding.",
  },
  {
    key: "none",
    label: "Fit is genoeg",
    hint: "Beoordeel op profiel; een aanleiding is niet nodig.",
  },
];

/**
 * "Zoek bedrijven": de volledige keten in één handeling.
 *
 *   zoeken → website verifiëren → opslaan → onderzoeken → scoren → top 10
 *
 * De stappen zijn opzettelijk apart zichtbaar. Zoeken en onderzoeken zijn
 * verschillende soorten werk met verschillende kosten, en als het onderzoek
 * halverwege stukloopt zijn de gevonden bedrijven al veilig opgeslagen — je hoeft
 * dan niet opnieuw te zoeken.
 */
export function DiscoveryPanel({ available }: { available: boolean }) {
  const router = useRouter();
  const [queries, setQueries] = React.useState<QueryOption[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [segment, setSegment] = React.useState("");
  const [perQuery, setPerQuery] = React.useState(25);
  const [provinceOptions, setProvinceOptions] = React.useState<Option[]>([]);
  const [sizeOptions, setSizeOptions] = React.useState<Option[]>([]);
  const [provinces, setProvinces] = React.useState<Set<string>>(new Set());
  /**
   * Standaard MKB: dat is de doelgroep die is afgesproken. De banden staan er
   * los bij, zodat een grote keten wél te vinden is als Eric daar bewust op
   * mikt — grote bedrijven zijn niet uitgesloten, ze zijn niet de default.
   */
  const [sizeBands, setSizeBands] = React.useState<Set<string>>(new Set());
  const [triggerMode, setTriggerMode] = React.useState<TriggerMode>("any");
  const [estimate, setEstimate] = React.useState<Estimate | null>(null);
  /**
   * Doelaantal nieuwe bedrijven. 300 als default: dat is wat Waalaxy per maand
   * aan contacten toelaat, dus meer prospects dan dat leveren geen extra
   * outreach op in dezelfde maand.
   */
  const [target, setTarget] = React.useState(300);
  const [busy, setBusy] = React.useState(false);
  const [step, setStep] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<DiscoverySummary | null>(null);
  const [message, setMessage] = React.useState<{
    tone: "info" | "error" | "success";
    text: string;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/radio/discover?per_query=${perQuery}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.ok) return;
        setQueries(data.queries ?? []);
        setProvinceOptions(data.provinces ?? []);
        setSizeOptions(data.size_bands ?? []);
        setEstimate(data.estimate ?? null);
        // MKB als startpunt, zodra we weten welke banden dat zijn.
        setSizeBands((current) => {
          if (current.size > 0) return current;
          const mkb = (data.size_bands ?? [])
            .filter((b: Option) => b.mkb)
            .map((b: Option) => b.key);
          return new Set<string>(mkb);
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [perQuery]);

  const rate = estimate?.eur_per_usd ?? FALLBACK_EUR_PER_USD;
  const formatEuro = (usd: number) => euro(usd, rate);

  const toggle = (key: string) => setSelected((c) => toggled(c, key));
  const toggleProvince = (key: string) => setProvinces((c) => toggled(c, key));
  const toggleSize = (key: string) => setSizeBands((c) => toggled(c, key));

  /** Onderzoek de net gevonden bedrijven, in rondes van 25. */
  const researchAll = async (ids: string[]): Promise<{ done: number; costUsd: number }> => {
    let done = 0;
    let costUsd = 0;
    let queue = [...ids];
    while (queue.length > 0) {
      setStep(`Onderzoeken en scoren… (${done}/${ids.length})`);
      const response = await fetch("/api/radio/research/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: queue }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) break;
      done += data.summary?.researched ?? 0;
      costUsd += data.summary?.costUsd ?? 0;
      const handled = new Set<string>(
        (data.summary?.results ?? []).map((r: { id: string }) => r.id),
      );
      queue = queue.filter((id) => !handled.has(id));
      if (handled.size === 0) break;
      router.refresh();
    }
    return { done, costUsd };
  };

  /**
   * De scan: loop door de zoekrichtingen tot het doelaantal gehaald is of de
   * richtingen op zijn.
   *
   * Eén richting per aanroep, want elke richting doet meerdere webzoekopdrachten
   * plus twee modelcalls — samen in één request zou dat de platform-timeout
   * raken. Door hier te lussen blijft elke request kort en is elke gevonden
   * lichting bedrijven al veilig opgeslagen als het later stukloopt.
   */
  const run = async (thenResearch: boolean) => {
    setBusy(true);
    setMessage(null);
    setSummary(null);

    // Gekozen richtingen, of alles (timing eerst — die leveren een aanleiding op).
    const plan =
      selected.size > 0
        ? queries.filter((q) => selected.has(q.key))
        : [...timing, ...fit].filter((q) => !segment || q.segment === segment || q.segment === null);

    if (plan.length === 0) {
      setMessage({ tone: "error", text: "Geen zoekrichting om te gebruiken." });
      setBusy(false);
      return;
    }

    const merged: DiscoverySummary = {
      added: [],
      duplicates: [],
      unreachable: [],
      withoutTrigger: [],
      rejectedSources: [],
      queriesUsed: [],
      warnings: [],
      costUsd: 0,
      searchesRun: 0,
    };
    const newIds: string[] = [];

    try {
      for (const [index, query] of plan.entries()) {
        if (newIds.length >= target) break;

        setStep(
          `Zoeken ${index + 1}/${plan.length}: ${query.label} — ${newIds.length}/${target} gevonden`,
        );

        const response = await fetch("/api/radio/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query_keys: [query.key],
            segment: segment || undefined,
            // Niet meer vragen dan we nog nodig hebben.
            per_query: Math.min(perQuery, Math.max(1, target - newIds.length)),
            max_queries: 1,
            provinces: [...provinces],
            size_bands: [...sizeBands],
            trigger_mode: triggerMode,
          }),
        });
        const data = await response.json();

        if (!response.ok || !data.ok) {
          merged.warnings.push(`${query.label}: ${data.error ?? "zoeken mislukt"}`);
          setSummary({ ...merged });
          continue;
        }

        const s: DiscoverySummary = data.summary;
        merged.added.push(...s.added);
        merged.duplicates.push(...s.duplicates);
        merged.unreachable.push(...s.unreachable);
        merged.withoutTrigger.push(...(s.withoutTrigger ?? []));
        merged.rejectedSources.push(...s.rejectedSources);
        merged.queriesUsed.push(...s.queriesUsed);
        merged.warnings.push(...s.warnings);
        merged.costUsd += s.costUsd ?? 0;
        merged.searchesRun += s.searchesRun ?? 0;
        newIds.push(...(data.new_ids ?? []));

        setSummary({ ...merged });
        router.refresh();
      }

      if (newIds.length === 0) {
        setMessage({
          tone: "info",
          text: "Geen nieuwe bedrijven gevonden. Probeer andere zoekrichtingen of een ander segment.",
        });
        return;
      }

      if (!thenResearch) {
        setMessage({
          tone: "success",
          text: `${newIds.length} nieuwe bedrijven toegevoegd (${formatEuro(merged.costUsd)}). Nog niet onderzocht.`,
        });
        return;
      }

      const research = await researchAll(newIds);
      merged.costUsd += research.costUsd;
      setSummary({ ...merged });
      setMessage({
        tone: "success",
        text: `${newIds.length} bedrijven gevonden, ${research.done} onderzocht en gescoord. Kosten van deze ronde: ${formatEuro(merged.costUsd)}.`,
      });
      router.push("/radio?sort=priority-desc");
    } catch {
      setMessage({
        tone: "error",
        text: "Er ging iets mis tijdens de scan. Wat al gevonden was, is opgeslagen.",
      });
    } finally {
      setBusy(false);
      setStep(null);
    }
  };

  const timing = queries.filter((q) => q.kind === "timing");
  const fit = queries.filter((q) => q.kind === "fit");

  return (
    <div className="space-y-5">
      {!available ? (
        <Notice tone="warn">
          <strong>Zoeken vereist een API-key.</strong> Zet{" "}
          <code className="rounded bg-surface px-1">ANTHROPIC_API_KEY</code> in{" "}
          <code className="rounded bg-surface px-1">.env.local</code> en herstart de server. Het
          zoeken gebruikt de web-search van de Claude API, dus je hebt geen aparte zoekdienst
          nodig.
        </Notice>
      ) : null}

      <Notice tone="info">
        <strong>Let op de flessenhals verderop.</strong> Deze scan vult je lijst met{" "}
        <em>bedrijven</em>. Waalaxy heeft per prospect een <em>LinkedIn-profiel van een persoon</em>{" "}
        nodig, en die verzint deze tool nooit — die vul je handmatig aan of importeer je via CSV. 300
        gescoorde bedrijven is dus nog geen 300 Waalaxy-contacten. Kijk op het dashboard naar{" "}
        <strong>Ready for Waalaxy</strong> om te zien hoeveel er echt klaarstaan.
      </Notice>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-base font-semibold text-ink">Bedrijven zoeken</h2>
        <p className="mt-1 text-sm text-muted">
          De tool zoekt op het web naar Nederlandse bedrijven die bij radio kunnen passen,
          controleert of hun website echt bestaat, onderzoekt ze en zet ze op prioriteit. De top
          komt uit de scoring-engine — niet uit de zoekmachine.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              Hoeveel bedrijven zoeken
            </span>
            <input
              type="number"
              min={1}
              max={1000}
              step={25}
              value={target}
              onChange={(event) => setTarget(Number(event.target.value) || 300)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-ink focus:border-brand/50 focus:outline-none"
            />
            <span className="mt-1 block text-xs text-subtle">
              Waalaxy doet ~300 contacten per maand.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              Segment (optioneel)
            </span>
            <select
              value={segment}
              onChange={(event) => setSegment(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-ink focus:border-brand/50 focus:outline-none"
            >
              <option value="">Alle segmenten</option>
              {RADIO_SEGMENTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              Max per zoekrichting
            </span>
            <input
              type="number"
              min={1}
              max={40}
              value={perQuery}
              onChange={(event) => setPerQuery(Number(event.target.value) || 25)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-ink focus:border-brand/50 focus:outline-none"
            />
            <span className="mt-1 block text-xs text-subtle">
              {queries.length} richtingen beschikbaar.
            </span>
          </label>
        </div>

        <div className="mt-4 space-y-3 rounded-lg border border-border bg-background p-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Verzorgingsgebied
            </h3>
            <p className="mt-1 text-xs text-subtle">
              Waar het bedrijf zijn klanten heeft — niet waar het kantoor staat. Voor regionale
              radio is dat wat telt. Kies je niets, dan zoekt de tool in heel Nederland.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {provinceOptions.map((p) => (
                <ChoiceChip
                  key={p.key}
                  label={p.label}
                  active={provinces.has(p.key)}
                  onClick={() => toggleProvince(p.key)}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Bedrijfsgrootte
            </h3>
            <p className="mt-1 text-xs text-subtle">
              MKB staat standaard aan. Grote bedrijven zijn niet uitgesloten — zet de band erbij
              als je die bewust wilt benaderen. De grootte bepaalt geen score, alleen waar we
              zoeken en waarop je kunt filteren.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sizeOptions.map((b) => (
                <ChoiceChip
                  key={b.key}
                  label={b.label}
                  active={sizeBands.has(b.key)}
                  onClick={() => toggleSize(b.key)}
                />
              ))}
              {sizeBands.size > 0 ? (
                <button
                  onClick={() => setSizeBands(new Set())}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-subtle hover:text-ink"
                >
                  Geen voorkeur
                </button>
              ) : null}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Aanleiding
            </h3>
            <p className="mt-1 text-xs text-subtle">
              {TRIGGER_MODES.find((m) => m.key === triggerMode)?.hint}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TRIGGER_MODES.map((m) => (
                <ChoiceChip
                  key={m.key}
                  label={m.label}
                  title={m.hint}
                  active={triggerMode === m.key}
                  onClick={() => setTriggerMode(m.key)}
                />
              ))}
            </div>
          </div>
        </div>

        {estimate ? <CostEstimate estimate={estimate} target={target} /> : null}

        {queries.length > 0 ? (
          <details className="mt-4 rounded-lg border border-border bg-background p-3">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              Zoekrichtingen kiezen
              {selected.size > 0 ? ` (${selected.size} gekozen)` : " — of laat de tool kiezen"}
            </summary>

            <p className="mt-2 text-xs text-muted">
              Kies je niets, dan pakt de tool de aanleiding-gerichte richtingen eerst. Die leveren
              bedrijven met een actueel signaal, en dat is precies waar de Trigger Score op
              scherpstelt.
            </p>

            <div className="mt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Aanleiding — waarom nu?
              </h3>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {timing.map((q) => (
                  <QueryChip
                    key={q.key}
                    query={q}
                    active={selected.has(q.key)}
                    onClick={() => toggle(q.key)}
                  />
                ))}
              </div>
            </div>

            <div className="mt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Fit — past radio structureel?
              </h3>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {fit.map((q) => (
                  <QueryChip
                    key={q.key}
                    query={q}
                    active={selected.has(q.key)}
                    onClick={() => toggle(q.key)}
                  />
                ))}
              </div>
            </div>

            {selected.size > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                className="mt-3"
                onClick={() => setSelected(new Set())}
              >
                Selectie wissen
              </Button>
            ) : null}
          </details>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => run(true)} disabled={busy || !available}>
            {busy ? "Bezig…" : `Scan: zoek ${target} bedrijven en score ze`}
          </Button>
          <Button variant="secondary" onClick={() => run(false)} disabled={busy || !available}>
            Alleen zoeken
          </Button>
        </div>

        {busy ? (
          <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-sm text-ink">{step ?? "Bezig…"}</p>
            <p className="mt-1 text-xs text-muted">
              Laat dit tabblad open staan. Elke gevonden lichting bedrijven wordt meteen
              opgeslagen, dus als het onderbreekt is niets kwijt en kun je verder waar je was.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">
            Reken op ruwweg een minuut per zoekrichting en een halve tot hele minuut per bedrijf
            om te onderzoeken. {target} bedrijven is dus een klus van uren, niet minuten — je kunt
            beter in porties van 50 werken en tussendoor kijken wat de scores doen.
          </p>
        )}
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {summary ? <DiscoveryResult summary={summary} rate={rate} /> : null}
    </div>
  );
}

function QueryChip({
  query,
  active,
  onClick,
}: {
  query: QueryOption;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={query.searches.join(" · ")}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-brand bg-brand text-brand-fg"
          : "border-border bg-surface text-muted hover:text-ink"
      }`}
    >
      {query.label}
    </button>
  );
}

function DiscoveryResult({ summary, rate }: { summary: DiscoverySummary; rate: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="font-display text-base font-semibold text-ink">Zoekresultaat</h3>

      <p className="mt-1 text-sm text-muted">
        {summary.searchesRun} webzoekopdracht{summary.searchesRun === 1 ? "" : "en"} ·{" "}
        <strong className="text-ink">{euro(summary.costUsd, rate)}</strong> aan API-kosten
      </p>

      {summary.queriesUsed.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {summary.queriesUsed.map((q) => (
            <li key={q.key} className="flex items-baseline justify-between gap-3">
              <span className="text-ink">{q.label}</span>
              <span className="shrink-0 text-xs text-muted">
                {q.found} nieuw · {q.searches} zoekopdracht{q.searches === 1 ? "" : "en"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {summary.added.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-success">
            Toegevoegd ({summary.added.length})
          </h4>
          <ul className="mt-1.5 space-y-0.5 text-sm text-ink">
            {summary.added.map((a) => (
              <li key={a.id}>
                {a.company_name}
                {a.website ? (
                  <span className="text-subtle"> — {a.website.replace(/^https?:\/\//, "")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.unreachable.length > 0 ? (
        <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-warning">
            Afgewezen — website bestond niet ({summary.unreachable.length})
          </h4>
          <ul className="mt-1.5 space-y-0.5 text-sm text-muted">
            {summary.unreachable.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Deze zijn bewust niet opgeslagen: als het domein niet bestaat, bestaat het bedrijf
            waarschijnlijk ook niet zoals gerapporteerd.
          </p>
        </div>
      ) : null}

      {summary.withoutTrigger.length > 0 ? (
        <p className="mt-3 text-sm text-muted">
          Overgeslagen omdat er geen aanleiding in de bron stond ({summary.withoutTrigger.length}):{" "}
          {summary.withoutTrigger.join(", ")}
        </p>
      ) : null}

      {summary.duplicates.length > 0 ? (
        <p className="mt-3 text-sm text-muted">
          Stond al in de lijst: {summary.duplicates.join(", ")}
        </p>
      ) : null}

      {summary.rejectedSources.length > 0 ? (
        <p className="mt-3 text-xs text-muted">
          {summary.rejectedSources.length} bron(nen) verworpen omdat ze niet in de zoekresultaten
          voorkwamen.
        </p>
      ) : null}

      {summary.warnings.length > 0 ? (
        <div className="mt-4 rounded-lg border border-border bg-background p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Meldingen</h4>
          <ul className="mt-1 space-y-0.5 text-sm text-muted">
            {summary.warnings.map((w, index) => (
              <li key={index}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Zet/uit in een Set, zonder de bestaande te muteren. */
function toggled(current: Set<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/**
 * Keuzeknopje. Eén component voor provincies, groottes en aanleiding-modus,
 * zodat die drie rijen er ook hetzelfde uitzien.
 */
function ChoiceChip({
  label,
  active,
  title,
  onClick,
}: {
  label: string;
  active: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-brand bg-brand text-brand-fg"
          : "border-border bg-background text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Wat de ronde ongeveer gaat kosten, vóór de start.
 *
 * Bewust als bandbreedte gepresenteerd en met de aannames erbij: het zijn echte
 * API-kosten, dus een te net getal zou meer zekerheid suggereren dan er is. Het
 * werkelijke bedrag staat na de ronde in de historie.
 */
function CostEstimate({ estimate, target }: { estimate: Estimate; target: number }) {
  // Ruwe aanname: een zoekrichting levert grofweg de helft van het gevraagde
  // maximum aan bruikbare, nieuwe bedrijven op.
  const yieldPerDirection = Math.max(1, Math.round(estimate.per_query / 2));
  const directions = Math.max(1, Math.ceil(target / yieldPerDirection));
  const searchTotal = directions * estimate.per_direction_usd;
  const researchTotal = target * estimate.per_company_usd;
  const rate = estimate.eur_per_usd;

  return (
    <div className="mt-3 rounded-lg border border-border bg-background p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Geschatte kosten
      </h3>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Per zoekrichting</dt>
          <dd className="text-ink">{estimate.per_direction_label}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Per onderzocht bedrijf</dt>
          <dd className="text-ink">{estimate.per_company_label}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Zoeken (~{directions} richtingen)</dt>
          <dd className="text-ink">{euro(searchTotal, rate)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Onderzoeken ({target} bedrijven)</dt>
          <dd className="text-ink">{euro(researchTotal, rate)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-border pt-1 sm:col-span-2">
          <dt className="font-medium text-ink">Totaal voor deze scan</dt>
          <dd className="font-semibold text-ink">{euro(searchTotal + researchTotal, rate)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-subtle">
        Schatting, geen prijsopgave. Gerekend met {estimate.searches_per_direction}{" "}
        webzoekopdrachten per richting, model {estimate.search_model} voor zoeken en{" "}
        {estimate.research_model} voor onderzoeken. Het echte bedrag staat na de ronde bij{" "}
        <strong className="text-muted">Historie</strong>.
      </p>
    </div>
  );
}

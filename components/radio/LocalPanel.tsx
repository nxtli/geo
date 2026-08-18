"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Notice } from "./primitives";

/**
 * "Lokale bedrijven": de simpele route.
 *
 * Kies branche + provincie → lijst bedrijven → per bedrijf een LinkedIn-zoeklink
 * naar de eigenaar. Geen AI, geen scores, geen credits.
 *
 * Bewust twee blokken, in de volgorde waarin je ze gebruikt: eerst de
 * bedrijvenlijst ophalen, daarna de LinkedIn-zoeklinks waarmee je in Waalaxy de
 * mensen importeert. Dat tweede blok werkt ook zónder de eerste stap — de
 * zoeklinks hebben de bedrijvenlijst niet nodig.
 */

interface Option {
  key: string;
  label: string;
}

interface Vertical extends Option {
  segment: string | null;
  angle: string;
  linkedin_terms: string[];
}

interface SearchLink {
  vertical: string;
  vertical_label: string;
  province: string;
  province_label: string;
  url: string;
  query: string;
}

interface LocalSummary {
  added: Array<{
    id: string;
    company_name: string;
    city: string | null;
    website: string | null;
    vertical: string;
    province: string;
    linkedin_search_url: string;
  }>;
  duplicates: number;
  chains: string[];
  withoutWebsite: number;
  perVertical: Array<{
    vertical: string;
    label: string;
    province: string;
    found: number;
    added: number;
  }>;
  warnings: string[];
}

export function LocalPanel() {
  const router = useRouter();
  const [verticals, setVerticals] = React.useState<Vertical[]>([]);
  const [provinceOptions, setProvinceOptions] = React.useState<Option[]>([]);
  const [searches, setSearches] = React.useState<SearchLink[]>([]);
  const [pickedVerticals, setPickedVerticals] = React.useState<Set<string>>(new Set());
  const [pickedProvinces, setPickedProvinces] = React.useState<Set<string>>(new Set());
  const [excludeChains, setExcludeChains] = React.useState(true);
  const [requireWebsite, setRequireWebsite] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [summary, setSummary] = React.useState<LocalSummary | null>(null);
  const [message, setMessage] = React.useState<{
    tone: "info" | "error" | "success";
    text: string;
  } | null>(null);

  // De zoeklinks komen van de server en hangen af van de gekozen provincies.
  React.useEffect(() => {
    const params = new URLSearchParams();
    for (const province of pickedProvinces) params.append("provinces", province);
    let cancelled = false;
    fetch(`/api/radio/local?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.ok) return;
        setVerticals(data.verticals ?? []);
        setProvinceOptions(data.provinces ?? []);
        setSearches(data.searches ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pickedProvinces]);

  const toggle = (set: Set<string>, key: string): Set<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const run = async () => {
    if (pickedProvinces.size === 0) {
      setMessage({ tone: "error", text: "Kies eerst minstens één provincie." });
      return;
    }
    setBusy(true);
    setMessage(null);
    setSummary(null);

    try {
      const response = await fetch("/api/radio/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verticals: [...pickedVerticals],
          provinces: [...pickedProvinces],
          exclude_chains: excludeChains,
          require_website: requireWebsite,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setMessage({ tone: "error", text: data.error ?? "Ophalen mislukt." });
        return;
      }
      setSummary(data.summary);
      setMessage({ tone: "success", text: data.message });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "De kaartdienst was niet bereikbaar." });
    } finally {
      setBusy(false);
    }
  };

  const relevantSearches = searches.filter(
    (s) => pickedVerticals.size === 0 || pickedVerticals.has(s.vertical),
  );

  return (
    <div className="space-y-5">
      <Notice tone="info">
        <strong>Deze route kost niets.</strong> De bedrijven komen uit openbare kaartdata
        (OpenStreetMap): geen AI, geen credits, geen scores. Je krijgt een bellijst en per bedrijf
        een LinkedIn-zoeklink naar de eigenaar. Wil je er alsnog fit- en trigger-scores bij, dan
        selecteer je ze later op het dashboard en start je de gewone research.
      </Notice>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-base font-semibold text-ink">1. Bedrijven ophalen</h2>
        <p className="mt-1 text-sm text-muted">
          Kies waar en wat. Eén branche in één provincie levert meestal tientallen zaken; alle
          branches in één provincie een paar honderd.
        </p>

        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Provincie</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {provinceOptions.map((province) => (
              <Chip
                key={province.key}
                label={province.label}
                active={pickedProvinces.has(province.key)}
                onClick={() => setPickedProvinces((c) => toggle(c, province.key))}
              />
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Branche{pickedVerticals.size > 0 ? ` (${pickedVerticals.size} gekozen)` : ""}
            </h3>
            {pickedVerticals.size > 0 ? (
              <button
                onClick={() => setPickedVerticals(new Set())}
                className="text-xs text-subtle hover:text-ink"
              >
                alles wissen
              </button>
            ) : (
              <span className="text-xs text-subtle">niets gekozen = alle branches</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {verticals.map((vertical) => (
              <Chip
                key={vertical.key}
                label={vertical.label}
                title={vertical.angle}
                active={pickedVerticals.has(vertical.key)}
                onClick={() => setPickedVerticals((c) => toggle(c, vertical.key))}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Toggle
            checked={excludeChains}
            onChange={setExcludeChains}
            label="Filialen van ketens overslaan"
            hint="Bij een keten beslist het hoofdkantoor over het budget. De kaartdata heeft een merknaam-tag, daar filteren we op."
          />
          <Toggle
            checked={requireWebsite}
            onChange={setRequireWebsite}
            label="Alleen bedrijven met een website in de kaartdata"
            hint="Strenger, maar je verliest zaken die wél bestaan en gewoon geen website in de kaart hebben staan. Uit laten levert een langere lijst."
          />
        </div>

        <div className="mt-4">
          <Button onClick={run} disabled={busy || pickedProvinces.size === 0}>
            {busy ? "Bezig met ophalen…" : "Bedrijven ophalen (gratis)"}
          </Button>
          {busy ? (
            <p className="mt-2 text-xs text-muted">
              Eén verzoek per provincie, met een pauze ertussen — de kaartdienst is gratis en van
              vrijwilligers. Reken op tien tot dertig seconden per provincie.
            </p>
          ) : null}
        </div>
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {summary ? <LocalResult summary={summary} /> : null}

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-base font-semibold text-ink">
          2. Mensen zoeken voor Waalaxy
        </h2>
        <p className="mt-1 text-sm text-muted">
          Open een zoeklink in LinkedIn en laat Waalaxy de mensen uit dat zoekresultaat importeren.
          De tool zoekt zelf niet op LinkedIn en verzint nooit een profiel-URL — hij bouwt alleen de
          zoekopdracht.
        </p>

        {pickedProvinces.size === 0 ? (
          <p className="mt-3 text-sm text-subtle">Kies hierboven een provincie.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {relevantSearches.map((search) => (
              <li
                key={`${search.vertical}-${search.province}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
              >
                <span className="text-sm text-ink">
                  {search.vertical_label}{" "}
                  <span className="text-subtle">· {search.province_label}</span>
                </span>
                <code className="min-w-0 flex-1 truncate rounded bg-background px-1.5 py-0.5 text-xs text-muted">
                  {search.query}
                </code>
                <a
                  href={search.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs font-medium text-ink hover:border-brand/50"
                >
                  Open in LinkedIn ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function LocalResult({ summary }: { summary: LocalSummary }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="font-display text-base font-semibold text-ink">
        {summary.added.length} bedrijven toegevoegd
      </h3>
      <p className="mt-1 text-sm text-muted">Kosten: € 0,00 — er is geen AI aan te pas gekomen.</p>

      {summary.perVertical.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {summary.perVertical
            .filter((row) => row.found > 0)
            .map((row) => (
              <li
                key={`${row.vertical}-${row.province}`}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-ink">{row.label}</span>
                <span className="shrink-0 text-xs text-muted">
                  {row.added} nieuw van {row.found} op de kaart
                </span>
              </li>
            ))}
        </ul>
      ) : null}

      {summary.added.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-2 py-1.5 font-medium">Bedrijf</th>
                <th className="px-2 py-1.5 font-medium">Plaats</th>
                <th className="px-2 py-1.5 font-medium">Website</th>
                <th className="px-2 py-1.5 font-medium">Beslisser</th>
              </tr>
            </thead>
            <tbody>
              {summary.added.map((row) => (
                <tr key={row.id} className="border-b border-border/50 last:border-0">
                  <td className="px-2 py-1.5 text-ink">{row.company_name}</td>
                  <td className="px-2 py-1.5 text-muted">{row.city ?? "—"}</td>
                  <td className="px-2 py-1.5 text-muted">
                    {row.website ? (
                      <a
                        href={row.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline decoration-border hover:decoration-brand"
                      >
                        {row.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      <span className="text-subtle">niet in de kaart</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <a
                      href={row.linkedin_search_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-brand underline decoration-border hover:decoration-brand"
                    >
                      zoek op LinkedIn ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {summary.chains.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted">
            {summary.chains.length} filialen van ketens overgeslagen
          </summary>
          <p className="mt-1 text-xs text-subtle">{summary.chains.join(", ")}</p>
        </details>
      ) : null}

      {summary.withoutWebsite > 0 ? (
        <p className="mt-2 text-sm text-muted">
          {summary.withoutWebsite} overgeslagen omdat er geen website in de kaartdata staat.
        </p>
      ) : null}

      {summary.warnings.length > 0 ? (
        <div className="mt-4 rounded-lg border border-border bg-background p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Meldingen</h4>
          <ul className="mt-1 space-y-0.5 text-sm text-muted">
            {summary.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Chip({
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

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand"
      />
      <span>
        <span className="block text-sm text-ink">{label}</span>
        <span className="block text-xs text-subtle">{hint}</span>
      </span>
    </label>
  );
}

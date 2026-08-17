"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PROSPECT_STATUSES } from "@/lib/radio/types";
import { RADIO_SEGMENTS } from "@/lib/radio/segments";
import { PROVINCES, NATIONWIDE } from "@/lib/radio/provinces";
import { SIZE_BANDS } from "@/lib/radio/company-size";
import { Button } from "./primitives";

/**
 * Filters (§15). De filterstaat leeft in de URL, niet in React-state: daardoor
 * is een filterweergave deelbaar en te bookmarken, werkt de terugknop, en hoeft
 * de tabel geen eigen kopie van de lijst bij te houden.
 */
const SORT_OPTIONS = [
  { value: "priority-desc", label: "Priority ↓ (standaard)" },
  { value: "priority-asc", label: "Priority ↑" },
  { value: "fit-desc", label: "Fit ↓" },
  { value: "trigger-desc", label: "Trigger ↓" },
  { value: "confidence-desc", label: "Confidence ↓" },
  { value: "confidence-asc", label: "Confidence ↑" },
  { value: "company-asc", label: "Bedrijfsnaam A→Z" },
  { value: "created-desc", label: "Nieuwste eerst" },
];

export function Filters({ resultCount, totalCount }: { resultCount: number; totalCount: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(false);

  const get = (key: string) => params.get(key) ?? "";

  const apply = (updates: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(next.toString() ? `/radio?${next}` : "/radio");
  };

  const activeCount = [
    "tier",
    "status",
    "segment",
    "industry",
    "angle",
    "location",
    "province",
    "size",
    "min_priority",
    "min_fit",
    "min_trigger",
    "contact",
    "linkedin",
    "q",
    "low_confidence",
    "hide_demo",
  ].filter((key) => params.get(key)).length;

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        {/* Zoeken is de meest gebruikte actie: altijd zichtbaar. */}
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("q");
            apply({ q: typeof value === "string" ? value.trim() : "" });
          }}
        >
          <input
            name="q"
            defaultValue={get("q")}
            placeholder="Zoek op bedrijfsnaam, website of branche…"
            className="min-w-[200px] flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-ink placeholder:text-subtle focus:border-brand/50 focus:outline-none"
          />
          <Button size="sm" variant="secondary" type="submit">
            Zoek
          </Button>
        </form>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted" htmlFor="sort">
            Sorteer
          </label>
          <select
            id="sort"
            value={get("sort") || "priority-desc"}
            onChange={(event) => apply({ sort: event.target.value })}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-ink focus:border-brand/50 focus:outline-none"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
      </div>

      {/* Snelle tier-filters — de meest gebruikte doorsnede. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-2">
        <span className="text-xs uppercase tracking-wide text-subtle">Snel</span>
        {(["A", "B", "C", "D"] as const).map((tier) => {
          const active = get("tier") === tier;
          return (
            <button
              key={tier}
              onClick={() => apply({ tier: active ? "" : tier })}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                active
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-border bg-background text-muted hover:text-ink"
              }`}
            >
              Tier {tier}
            </button>
          );
        })}
        <button
          onClick={() => apply({ linkedin: get("linkedin") === "yes" ? "" : "yes" })}
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
            get("linkedin") === "yes"
              ? "border-brand bg-brand text-brand-fg"
              : "border-border bg-background text-muted hover:text-ink"
          }`}
        >
          Met LinkedIn
        </button>
        <button
          onClick={() => apply({ low_confidence: get("low_confidence") ? "" : "1" })}
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
            get("low_confidence")
              ? "border-danger bg-danger/10 text-danger"
              : "border-border bg-background text-muted hover:text-ink"
          }`}
        >
          ⚠ Lage confidence
        </button>
        <button
          onClick={() => apply({ size: get("size") === "mkb" ? "" : "mkb" })}
          title="Tot 99 medewerkers"
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
            get("size") === "mkb"
              ? "border-brand bg-brand text-brand-fg"
              : "border-border bg-background text-muted hover:text-ink"
          }`}
        >
          MKB
        </button>
        <button
          onClick={() => apply({ hide_demo: get("hide_demo") ? "" : "1" })}
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
            get("hide_demo")
              ? "border-brand bg-brand text-brand-fg"
              : "border-border bg-background text-muted hover:text-ink"
          }`}
        >
          Demo verbergen
        </button>

        <span className="ml-auto text-xs text-muted">
          {resultCount} van {totalCount} zichtbaar
        </span>
        {activeCount > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => router.push("/radio")}>
            Wis filters
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="grid gap-4 border-t border-border px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tier">
            <select
              value={get("tier")}
              onChange={(event) => apply({ tier: event.target.value })}
              className={selectClass}
            >
              <option value="">Alle tiers</option>
              {(["A", "B", "C", "D"] as const).map((t) => (
                <option key={t} value={t}>
                  Tier {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Status">
            <select
              value={get("status")}
              onChange={(event) => apply({ status: event.target.value })}
              className={selectClass}
            >
              <option value="">Alle statussen</option>
              {PROSPECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Segment">
            <select
              value={get("segment")}
              onChange={(event) => apply({ segment: event.target.value })}
              className={selectClass}
            >
              <option value="">Alle segmenten</option>
              {RADIO_SEGMENTS.map((segment) => (
                <option key={segment.key} value={segment.key}>
                  {segment.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Contactpersoon">
            <select
              value={get("contact")}
              onChange={(event) => apply({ contact: event.target.value })}
              className={selectClass}
            >
              <option value="">Maakt niet uit</option>
              <option value="yes">Gevonden</option>
              <option value="no">Niet gevonden</option>
            </select>
          </Field>

          <Field label="LinkedIn-URL">
            <select
              value={get("linkedin")}
              onChange={(event) => apply({ linkedin: event.target.value })}
              className={selectClass}
            >
              <option value="">Maakt niet uit</option>
              <option value="yes">Aanwezig</option>
              <option value="no">Ontbreekt</option>
            </select>
          </Field>

          <Field label="Branche bevat">
            <DebouncedInput
              value={get("industry")}
              placeholder="bijv. supermarkt"
              onCommit={(value) => apply({ industry: value })}
            />
          </Field>

          <Field label="Sales angle bevat">
            <DebouncedInput
              value={get("angle")}
              placeholder="bijv. recruitment"
              onCommit={(value) => apply({ angle: value })}
            />
          </Field>

          <Field label="Verzorgingsgebied">
            <select
              value={get("province")}
              onChange={(event) => apply({ province: event.target.value })}
              className={selectClass}
            >
              <option value="">Alle provincies</option>
              <option value={NATIONWIDE}>Alleen landelijk actief</option>
              {PROVINCES.map((province) => (
                <option key={province.key} value={province.key}>
                  {province.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-subtle">
              Landelijke bedrijven matchen elke provincie. Prospects met een onbekend
              verzorgingsgebied vallen weg.
            </span>
          </Field>

          <Field label="Bedrijfsgrootte">
            <select
              value={get("size")}
              onChange={(event) => apply({ size: event.target.value })}
              className={selectClass}
            >
              <option value="">Alle groottes</option>
              <option value="mkb">MKB (tot 99)</option>
              {SIZE_BANDS.map((band) => (
                <option key={band.key} value={band.key}>
                  {band.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Locatie bevat">
            <DebouncedInput
              value={get("location")}
              placeholder="bijv. Utrecht"
              onCommit={(value) => apply({ location: value })}
            />
          </Field>

          <Field label="Priority ≥">
            <NumberInput value={get("min_priority")} onCommit={(v) => apply({ min_priority: v })} />
          </Field>
          <Field label="Fit ≥">
            <NumberInput value={get("min_fit")} onCommit={(v) => apply({ min_fit: v })} />
          </Field>
          <Field label="Trigger ≥">
            <NumberInput value={get("min_trigger")} onCommit={(v) => apply({ min_trigger: v })} />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

const selectClass =
  "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-ink focus:border-brand/50 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Tekstveld dat pas filtert bij Enter of blur — niet bij elke toetsaanslag. */
function DebouncedInput({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft.trim() !== value && onCommit(draft.trim())}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit(draft.trim());
      }}
      className={selectClass}
    />
  );
}

function NumberInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return (
    <input
      type="number"
      min={0}
      max={100}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit(draft);
      }}
      className={selectClass}
    />
  );
}

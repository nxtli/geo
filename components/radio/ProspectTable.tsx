"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Prospect } from "@/lib/radio/types";
import {
  Button,
  ConfidenceBadge,
  DemoBadge,
  MiniScore,
  Notice,
  TierBadge,
  cn,
} from "./primitives";
import { truncate } from "@/lib/radio/validation";
import { provincesLabel } from "@/lib/radio/provinces";
import { sizeBandLabel } from "@/lib/radio/company-size";
import { ownerSearchUrl } from "@/lib/radio/linkedin-search";

interface MissingRow {
  id: string;
  company_name: string;
  contact_name: string | null;
  recommended_role: string | null;
  reason: string;
}

interface ExportState {
  exported: number;
  missing: MissingRow[];
  csv: string;
  missingCsv: string;
}

/**
 * De prospect-tabel: het hoofdscherm (§25).
 *
 * Kolommen: Company | Fit | Trigger | Priority | Tier | Angle | Contact |
 * LinkedIn | Status. Selectie via checkbox voor de Waalaxy-export.
 *
 * De export laat éérst zien wie er niet mee kan (geen LinkedIn-profiel) en
 * downloadt daarna pas — zo verdwijnt niemand stilzwijgend uit de lijst.
 */
export function ProspectTable({ prospects }: { prospects: Prospect[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<string | null>(null);
  const [exportState, setExportState] = React.useState<ExportState | null>(null);
  const [message, setMessage] = React.useState<{ tone: "info" | "error" | "success"; text: string } | null>(
    null,
  );

  // Selectie opschonen als de lijst verandert (bijv. na een filter of research).
  React.useEffect(() => {
    setSelected((current) => {
      const ids = new Set(prospects.map((p) => p.id));
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [prospects]);

  const allSelected = prospects.length > 0 && selected.size === prospects.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(prospects.map((p) => p.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const research = async (id: string) => {
    setBusy(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/radio/prospects/${id}/research`, { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setMessage({ tone: "error", text: data.error ?? "De analyse is mislukt." });
        return;
      }
      const parts = [
        `${data.prospect.company_name}: priority ${data.prospect.priority_score} (tier ${data.prospect.tier})`,
      ];
      if (data.source_count === 0) parts.push("geen bronnen opgehaald");
      else parts.push(`${data.source_count} bron(nen)`);
      if (data.rejected_sources?.length) {
        parts.push(`${data.rejected_sources.length} onverifieerbare bron verworpen`);
      }
      setMessage({
        tone: data.warning ? "info" : "success",
        text: parts.join(" · ") + (data.warning ? ` — ${data.warning}` : ""),
      });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Kon de analyse niet starten." });
    } finally {
      setBusy(null);
    }
  };

  const runExport = async () => {
    if (selected.size === 0) return;
    setBusy("export");
    setMessage(null);
    setExportState(null);
    try {
      const response = await fetch("/api/radio/export/waalaxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], format: "json" }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setMessage({ tone: "error", text: data.error ?? "Export mislukt." });
        return;
      }
      setExportState({
        exported: data.exported,
        missing: data.missing_linkedin ?? [],
        csv: data.csv,
        missingCsv: data.missing_csv,
      });
    } catch {
      setMessage({ tone: "error", text: "Kon de export niet maken." });
    } finally {
      setBusy(null);
    }
  };

  const download = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const markExported = async () => {
    setBusy("mark");
    try {
      await fetch("/api/radio/export/waalaxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], format: "json", mark_exported: true }),
      });
      setMessage({ tone: "success", text: "Status bijgewerkt naar 'Exported to Waalaxy'." });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted">
          {selected.size > 0
            ? `${selected.size} van ${prospects.length} geselecteerd`
            : `${prospects.length} prospect${prospects.length === 1 ? "" : "s"}`}
        </span>
        <Button size="sm" onClick={runExport} disabled={selected.size === 0 || busy === "export"}>
          {busy === "export" ? "Bezig…" : "Export Waalaxy CSV"}
        </Button>
        {selected.size > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Selectie wissen
          </Button>
        ) : null}
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {exportState ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">
                {exportState.exported} prospect{exportState.exported === 1 ? "" : "s"} klaar voor
                Waalaxy
              </p>
              {exportState.missing.length > 0 ? (
                <p className="mt-0.5 text-sm text-warning">
                  {exportState.missing.length} prospect
                  {exportState.missing.length === 1 ? "" : "s"} kan niet mee — zie hieronder.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {exportState.exported > 0 ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => download(exportState.csv, `waalaxy-prospects-${stamp}.csv`)}
                  >
                    Download CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={markExported}
                    disabled={busy === "mark"}
                  >
                    Markeer als geëxporteerd
                  </Button>
                </>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setExportState(null)}>
                Sluiten
              </Button>
            </div>
          </div>

          {exportState.missing.length > 0 ? (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-warning">Missing LinkedIn URL</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    download(exportState.missingCsv, `waalaxy-missing-linkedin-${stamp}.csv`)
                  }
                >
                  Download deze lijst
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted">
                Er wordt nooit een LinkedIn-URL verzonnen. Vul die handmatig aan op de detailpagina
                of via een CSV-import, dan kunnen deze prospects mee in een volgende export.
              </p>
              <ul className="mt-2 space-y-1">
                {exportState.missing.map((row) => (
                  <li key={row.id} className="text-sm">
                    <Link
                      href={`/radio/prospects/${row.id}`}
                      className="font-medium text-ink underline decoration-border hover:decoration-brand"
                    >
                      {row.company_name}
                    </Link>
                    <span className="text-muted">
                      {" — "}
                      {row.contact_name ?? row.recommended_role ?? "geen contact"}: {row.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b border-border bg-background/60 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Alles selecteren"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 cursor-pointer accent-brand"
                />
              </th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Fit</th>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Angle</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">LinkedIn</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {prospects.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-muted">
                  Geen prospects gevonden. Pas de filters aan of{" "}
                  <Link href="/radio/import" className="text-brand underline">
                    voeg bedrijven toe
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              prospects.map((p) => {
                const contactName =
                  [p.contact.first_name, p.contact.last_name].filter(Boolean).join(" ") || null;
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-b border-border/60 last:border-0 hover:bg-background/40",
                      selected.has(p.id) && "bg-brand/5",
                    )}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`${p.company_name} selecteren`}
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        className="h-4 w-4 cursor-pointer accent-brand"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/radio/prospects/${p.id}`}
                          className="font-medium text-ink underline decoration-border hover:decoration-brand"
                        >
                          {p.company_name}
                        </Link>
                        {p.demo ? <DemoBadge /> : null}
                      </div>
                      <div className="text-xs text-subtle">
                        {[p.industry, p.city].filter(Boolean).join(" · ") || "—"}
                      </div>
                      {p.size_band || p.coverage_provinces.length > 0 ? (
                        <div className="text-xs text-subtle">
                          {[
                            p.size_band ? sizeBandLabel(p.size_band) : null,
                            p.coverage_provinces.length > 0
                              ? provincesLabel(p.coverage_provinces)
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <MiniScore value={p.fit_score} />
                    </td>
                    <td className="px-3 py-2">
                      <MiniScore value={p.trigger_score} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-display text-base font-semibold tabular-nums text-ink">
                        {p.priority_score ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <TierBadge tier={p.tier} />
                    </td>
                    <td className="max-w-[240px] px-3 py-2 text-muted">
                      {p.primary_sales_angle ? (
                        <span title={p.primary_sales_angle}>
                          {truncate(p.primary_sales_angle, 70)}
                          {p.angle_strength ? (
                            <span className="ml-1 text-subtle">({p.angle_strength}/10)</span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {contactName ? (
                        <div>
                          <div className="text-ink">{contactName}</div>
                          <div className="text-xs text-subtle">
                            {p.contact.title ?? p.recommended_contact_role ?? ""}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted">
                          <span className="italic">niet gevonden</span>
                          {p.recommended_contact_role ? (
                            <div className="text-subtle">→ {p.recommended_contact_role}</div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {p.contact.linkedin_url ? (
                        <a
                          href={p.contact.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="text-brand underline"
                        >
                          profiel
                        </a>
                      ) : (
                        // Geen profiel-URL? Dan geen streepje, maar de zoekopdracht
                        // waarmee je hem zelf in één klik vindt. De tool verzint
                        // nooit een profiel-URL, maar mag je wel de zoekactie
                        // uit handen nemen.
                        <a
                          href={ownerSearchUrl(p.company_name, { city: p.city })}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          title="Zoek de eigenaar of directeur van dit bedrijf op LinkedIn"
                          className="text-muted underline decoration-border hover:text-ink"
                        >
                          zoek ↗
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="whitespace-nowrap rounded border border-border bg-background px-2 py-0.5 text-xs text-muted">
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <ConfidenceBadge score={p.research_confidence} label={p.confidence} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => research(p.id)}
                        disabled={busy === p.id}
                      >
                        {busy === p.id
                          ? "Bezig…"
                          : p.fit_score === null
                            ? "Onderzoek"
                            : "Opnieuw"}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

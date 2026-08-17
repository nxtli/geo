"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Notice } from "./primitives";

type Tab = "single" | "csv" | "batch";

interface ImportSummary {
  added: Array<{ id: string; company_name: string }>;
  duplicates: Array<{ id: string; company_name: string }>;
  failed: Array<{ company_name: string; reason: string }>;
  parse_errors: Array<{ line: number; reason: string }>;
  new_ids: string[];
  message: string;
}

/**
 * De drie manieren om prospects toe te voegen (§13).
 *
 * Import en research zijn bewust GESCHEIDEN: eerst zie je wat er binnenkwam en
 * wat dubbel was, daarna start je de analyse. Anders veroorzaakt één plakactie
 * van 100 regels meteen 100 modelcalls zonder dat iemand de invoer heeft
 * gecontroleerd.
 */
export function ImportForms() {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("single");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{
    tone: "info" | "error" | "success";
    text: string;
  } | null>(null);
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);
  const [progress, setProgress] = React.useState<string | null>(null);

  /* Handmatig ---------------------------------------------------------- */
  const [single, setSingle] = React.useState({
    company_name: "",
    website: "",
    city: "",
    industry: "",
    linkedin_url: "",
    contact_first_name: "",
    contact_last_name: "",
    contact_title: "",
  });

  const addSingle = async (thenResearch: boolean) => {
    if (!single.company_name.trim() && !single.website.trim()) {
      setMessage({ tone: "error", text: "Vul minimaal een bedrijfsnaam of website in." });
      return;
    }
    setBusy(true);
    setMessage(null);
    setSummary(null);
    try {
      const response = await fetch("/api/radio/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(single),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setMessage({ tone: "error", text: data.error ?? "Toevoegen mislukt." });
        return;
      }

      if (thenResearch) {
        setProgress("Onderzoekt…");
        const research = await fetch(`/api/radio/prospects/${data.prospect.id}/research`, {
          method: "POST",
        });
        const researched = await research.json();
        if (researched.ok) {
          router.push(`/radio/prospects/${data.prospect.id}`);
          return;
        }
        setMessage({
          tone: "info",
          text: `${data.message} De analyse lukte niet: ${researched.error ?? "onbekende fout"}.`,
        });
      } else {
        setMessage({ tone: "success", text: data.message });
      }

      setSingle({
        company_name: "",
        website: "",
        city: "",
        industry: "",
        linkedin_url: "",
        contact_first_name: "",
        contact_last_name: "",
        contact_title: "",
      });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Toevoegen mislukt." });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  /* CSV en batch ------------------------------------------------------- */
  const [text, setText] = React.useState("");

  const runImport = async (mode: "csv" | "batch") => {
    if (!text.trim()) {
      setMessage({ tone: "error", text: "Er is nog niets ingevuld." });
      return;
    }
    setBusy(true);
    setMessage(null);
    setSummary(null);
    try {
      const response = await fetch("/api/radio/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, text }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setMessage({ tone: "error", text: data.error ?? "Import mislukt." });
        if (Array.isArray(data.parse_errors) && data.parse_errors.length > 0) {
          setSummary({
            added: [],
            duplicates: [],
            failed: [],
            parse_errors: data.parse_errors,
            new_ids: [],
            message: "",
          });
        }
        return;
      }
      setSummary(data);
      setMessage({ tone: "success", text: data.message });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Import mislukt." });
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setText(await file.text());
    setMessage({ tone: "info", text: `${file.name} ingelezen — controleer en importeer.` });
  };

  /** Onderzoek de net geïmporteerde bedrijven, in rondes. */
  const researchImported = async (ids: string[]) => {
    setBusy(true);
    setMessage(null);
    let done = 0;
    let queue = [...ids];
    try {
      while (queue.length > 0) {
        setProgress(`${done} van ${ids.length} onderzocht…`);
        const response = await fetch("/api/radio/research/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: queue }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          setMessage({ tone: "error", text: data.error ?? "De analyse is mislukt." });
          return;
        }
        const researched = data.summary?.researched ?? 0;
        done += researched;
        const handled = new Set<string>(
          (data.summary?.results ?? []).map((r: { id: string }) => r.id),
        );
        queue = queue.filter((id) => !handled.has(id));
        // Geen voortgang meer: stoppen in plaats van eindeloos doorgaan.
        if (handled.size === 0) break;
      }
      setMessage({
        tone: "success",
        text: `${done} bedrijven onderzocht en gescoord.`,
      });
      router.push("/radio");
    } catch {
      setMessage({ tone: "error", text: "De analyse is mislukt." });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
        <TabButton active={tab === "single"} onClick={() => setTab("single")}>
          Eén bedrijf
        </TabButton>
        <TabButton active={tab === "csv"} onClick={() => setTab("csv")}>
          CSV-import
        </TabButton>
        <TabButton active={tab === "batch"} onClick={() => setTab("batch")}>
          Batch (lijst websites)
        </TabButton>
      </div>

      {message ? (
        <Notice tone={message.tone}>
          {progress ?? message.text}
        </Notice>
      ) : progress ? (
        <Notice tone="info">{progress}</Notice>
      ) : null}

      {tab === "single" ? (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-base font-semibold text-ink">Bedrijf toevoegen</h2>
          <p className="mt-1 text-sm text-muted">
            Naam en website zijn genoeg. De rest vult de research aan; contactgegevens kun je
            meteen meegeven als je die hebt.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input
              label="Bedrijfsnaam"
              value={single.company_name}
              onChange={(v) => setSingle({ ...single, company_name: v })}
              placeholder="bijv. Zonnestraat Keukens"
            />
            <Input
              label="Website"
              value={single.website}
              onChange={(v) => setSingle({ ...single, website: v })}
              placeholder="bijv. zonnestraat-keukens.nl"
            />
            <Input
              label="Plaats (optioneel)"
              value={single.city}
              onChange={(v) => setSingle({ ...single, city: v })}
            />
            <Input
              label="Branche (optioneel)"
              value={single.industry}
              onChange={(v) => setSingle({ ...single, industry: v })}
            />
          </div>

          <details className="mt-4 rounded-lg border border-border bg-background p-3">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              Contactpersoon meegeven (optioneel)
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input
                label="Voornaam"
                value={single.contact_first_name}
                onChange={(v) => setSingle({ ...single, contact_first_name: v })}
              />
              <Input
                label="Achternaam"
                value={single.contact_last_name}
                onChange={(v) => setSingle({ ...single, contact_last_name: v })}
              />
              <Input
                label="Functie"
                value={single.contact_title}
                onChange={(v) => setSingle({ ...single, contact_title: v })}
              />
              <Input
                label="LinkedIn-URL"
                value={single.linkedin_url}
                onChange={(v) => setSingle({ ...single, linkedin_url: v })}
                placeholder="https://www.linkedin.com/in/…"
              />
            </div>
            <p className="mt-2 text-xs text-subtle">
              LinkedIn-URL&apos;s worden nooit automatisch opgezocht of afgeleid — alleen wat je hier
              (of via CSV) invult wordt gebruikt.
            </p>
          </details>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => addSingle(true)} disabled={busy}>
              {busy ? "Bezig…" : "Toevoegen + Research & Score"}
            </Button>
            <Button variant="secondary" onClick={() => addSingle(false)} disabled={busy}>
              Alleen toevoegen
            </Button>
          </div>
        </div>
      ) : null}

      {tab === "csv" ? (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-base font-semibold text-ink">CSV-import</h2>
          <p className="mt-1 text-sm text-muted">
            Minimaal een kolom <code className="rounded bg-background px-1">company_name</code> of{" "}
            <code className="rounded bg-background px-1">website</code>. Komma&apos;s en
            puntkomma&apos;s worden beide herkend, net als Nederlandse kolomnamen
            (bedrijfsnaam, voornaam, functie…).
          </p>

          <div className="mt-3 rounded-lg border border-border bg-background p-3 font-mono text-xs text-muted">
            <div>company_name,website</div>
            <div className="mt-2 text-subtle">of uitgebreid:</div>
            <div>company_name,website,linkedin_url,contact_first_name,contact_last_name</div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              Bestand kiezen
            </label>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={readFile}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:text-ink"
            />
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              …of plak de CSV hier
            </span>
            <textarea
              rows={10}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"company_name,website\nZonnestraat Keukens,zonnestraat-keukens.nl"}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-ink placeholder:text-subtle focus:border-brand/50 focus:outline-none"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => runImport("csv")} disabled={busy}>
              {busy ? "Bezig…" : "Importeren"}
            </Button>
            {text ? (
              <Button variant="ghost" onClick={() => setText("")} disabled={busy}>
                Wissen
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "batch" ? (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-base font-semibold text-ink">
            Batch — lijst van websites
          </h2>
          <p className="mt-1 text-sm text-muted">
            Eén bedrijf per regel: alleen een website, of &quot;Naam, website&quot;. Bedoeld om in
            één keer een lijst van bijvoorbeeld 100 bedrijven klaar te zetten. Na de import kun je
            ze allemaal in één handeling laten onderzoeken en rangschikken.
          </p>

          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              Websites
            </span>
            <textarea
              rows={12}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"zonnestraat-keukens.nl\nnoordlicht-autogroep.nl\nBakkerij Van Loon, bakkerij-van-loon.nl"}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-ink placeholder:text-subtle focus:border-brand/50 focus:outline-none"
            />
          </label>
          <p className="mt-1 text-xs text-subtle">
            {text.split("\n").filter((l) => l.trim()).length} regel(s)
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => runImport("batch")} disabled={busy}>
              {busy ? "Bezig…" : "Importeren"}
            </Button>
            {text ? (
              <Button variant="ghost" onClick={() => setText("")} disabled={busy}>
                Wissen
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {summary ? (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="font-display text-base font-semibold text-ink">Importresultaat</h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <SummaryTile label="Toegevoegd" value={summary.added.length} tone="good" />
            <SummaryTile label="Stond al in de lijst" value={summary.duplicates.length} />
            <SummaryTile
              label="Overgeslagen"
              value={summary.parse_errors.length + summary.failed.length}
              tone={summary.parse_errors.length + summary.failed.length > 0 ? "warn" : "default"}
            />
          </div>

          {summary.parse_errors.length > 0 ? (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <h4 className="text-sm font-semibold text-warning">Overgeslagen regels</h4>
              <ul className="mt-1 space-y-0.5 text-sm text-muted">
                {summary.parse_errors.slice(0, 20).map((error, index) => (
                  <li key={index}>
                    Regel {error.line}: {error.reason}
                  </li>
                ))}
              </ul>
              {summary.parse_errors.length > 20 ? (
                <p className="mt-1 text-xs text-subtle">
                  …en {summary.parse_errors.length - 20} meer.
                </p>
              ) : null}
            </div>
          ) : null}

          {summary.failed.length > 0 ? (
            <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3">
              <h4 className="text-sm font-semibold text-danger">Niet opgeslagen</h4>
              <ul className="mt-1 space-y-0.5 text-sm text-muted">
                {summary.failed.map((item, index) => (
                  <li key={index}>
                    {item.company_name}: {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {summary.new_ids.length > 0 ? (
              <Button onClick={() => researchImported(summary.new_ids)} disabled={busy}>
                {busy
                  ? (progress ?? "Bezig…")
                  : `Onderzoek deze ${summary.new_ids.length} bedrijven`}
              </Button>
            ) : null}
            <Link href="/radio">
              <Button variant="secondary">Naar het dashboard</Button>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-brand text-brand-fg" : "text-muted hover:bg-background hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-ink placeholder:text-subtle focus:border-brand/50 focus:outline-none"
      />
    </label>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "good" | "warn";
}) {
  const valueTone = { default: "text-ink", good: "text-success", warn: "text-warning" }[tone];
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 font-display text-xl font-semibold tabular-nums ${valueTone}`}>
        {value}
      </div>
    </div>
  );
}

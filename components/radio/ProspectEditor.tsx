"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Prospect } from "@/lib/radio/types";
import { PROSPECT_STATUSES } from "@/lib/radio/types";
import { Button, Notice } from "./primitives";

/**
 * De velden die Eric zelf beheert: status, contactpersoon, LinkedIn-URL en
 * notities.
 *
 * De LinkedIn-URL wordt server-side gevalideerd; een onbruikbare URL geeft een
 * duidelijke fout in plaats van stil te mislukken. Er wordt hier nooit een URL
 * voorgesteld of afgeleid — die vult een mens in.
 */
export function ProspectEditor({ prospect }: { prospect: Prospect }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const [form, setForm] = React.useState({
    status: prospect.status,
    contact_first_name: prospect.contact.first_name ?? "",
    contact_last_name: prospect.contact.last_name ?? "",
    contact_title: prospect.contact.title ?? "",
    linkedin_url: prospect.contact.linkedin_url ?? "",
    notes: prospect.notes ?? "",
  });

  const dirty =
    form.status !== prospect.status ||
    form.contact_first_name !== (prospect.contact.first_name ?? "") ||
    form.contact_last_name !== (prospect.contact.last_name ?? "") ||
    form.contact_title !== (prospect.contact.title ?? "") ||
    form.linkedin_url !== (prospect.contact.linkedin_url ?? "") ||
    form.notes !== (prospect.notes ?? "");

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/radio/prospects/${prospect.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setMessage({ tone: "error", text: data.error ?? "Opslaan mislukt." });
        return;
      }
      setMessage({ tone: "success", text: "Opgeslagen." });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Opslaan mislukt." });
    } finally {
      setBusy(false);
    }
  };

  const set = (key: keyof typeof form) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
          Status
        </span>
        <select value={form.status} onChange={set("status")} className={inputClass}>
          {PROSPECT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
            Voornaam
          </span>
          <input value={form.contact_first_name} onChange={set("contact_first_name")} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
            Achternaam
          </span>
          <input value={form.contact_last_name} onChange={set("contact_last_name")} className={inputClass} />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
          Functie
        </span>
        <input
          value={form.contact_title}
          onChange={set("contact_title")}
          placeholder={prospect.recommended_contact_role ?? "bijv. Head of Marketing"}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
          LinkedIn-URL
        </span>
        <input
          value={form.linkedin_url}
          onChange={set("linkedin_url")}
          placeholder="https://www.linkedin.com/in/…"
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-subtle">
          Handmatig invullen of via CSV importeren. Nodig voor de Waalaxy-export.
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
          Notities
        </span>
        <textarea rows={4} value={form.notes} onChange={set("notes")} className={inputClass} />
      </label>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={!dirty || busy} size="sm">
          {busy ? "Opslaan…" : "Opslaan"}
        </Button>
        {dirty ? <span className="text-xs text-muted">Niet opgeslagen wijzigingen</span> : null}
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-ink placeholder:text-subtle focus:border-brand/50 focus:outline-none";

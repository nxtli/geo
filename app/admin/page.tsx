import type { Metadata } from "next";
import { listScansForAdmin, isSupabaseConfigured } from "@/lib/geo/supabase/service";
import { costUsd, fmtEur, fmtUsd, usdToEur } from "@/lib/geo/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hidden, auth-gated (see middleware.ts). Keep it out of search indexes.
export const metadata: Metadata = {
  title: "Admin — GEO Scan",
  robots: { index: false, follow: false },
};

const ROW_LIMIT = 500;

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function AdminPage() {
  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <p className="text-muted">
          Supabase is niet geconfigureerd, dus er zijn geen inzendingen om te
          tonen. Zet <code>SUPABASE_URL</code> en{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.
        </p>
      </Shell>
    );
  }

  const rows = await listScansForAdmin(ROW_LIMIT);

  const completed = rows.filter((r) => r.status === "completed");
  const failed = rows.filter((r) => r.status === "failed");
  const totalIn = rows.reduce((s, r) => s + (r.input_tokens ?? 0), 0);
  const totalOut = rows.reduce((s, r) => s + (r.output_tokens ?? 0), 0);
  const totalUsd = rows.reduce(
    (s, r) => s + costUsd(r.model, r.input_tokens, r.output_tokens),
    0,
  );

  return (
    <Shell>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Inzendingen" value={String(rows.length)} sub={`laatste ${ROW_LIMIT}`} />
        <Stat label="Voltooid" value={String(completed.length)} sub={`${failed.length} mislukt`} />
        <Stat
          label="Tokens"
          value={`${(totalIn / 1000).toFixed(1)}k in`}
          sub={`${(totalOut / 1000).toFixed(1)}k uit`}
        />
        <Stat label="Kosten" value={fmtEur(totalUsd)} sub={fmtUsd(totalUsd)} highlight />
      </div>

      <p className="mt-3 text-xs text-subtle">
        Kosten zijn berekend uit opgeslagen token-usage (vanaf de invoering van
        deze meting; oudere scans tonen geen tokens). Koers:{" "}
        {usdToEur(1).toFixed(2)} €/$ — aanpasbaar via <code>ADMIN_EUR_PER_USD</code>.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border bg-elevated/60 text-xs uppercase tracking-wide text-subtle">
            <tr>
              {["Datum", "Naam", "E-mail", "Bedrijf", "Functie", "Telefoon", "Homepage", "Status", "Score", "Model", "Tokens", "Kosten", ""].map(
                (h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-muted">
                  Nog geen inzendingen.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const usd = costUsd(r.model, r.input_tokens, r.output_tokens);
                return (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">{fmtDate(r.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-ink">{r.name ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">{r.email ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">{r.company_name ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">{r.job_title ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">{r.phone ?? "—"}</td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-muted" title={r.homepage_url}>
                      {r.homepage_url}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-ink">{r.visibility_score ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-subtle">{r.model ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-subtle">
                      {r.input_tokens != null
                        ? `${r.input_tokens}/${r.output_tokens ?? 0}`
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                      {r.input_tokens != null ? `${fmtEur(usd)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <a
                        href={`/api/geo/report/${r.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline"
                      >
                        rapport
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <span className="font-display text-xl font-bold tracking-tight text-ink">
              NXTLI
            </span>
            <span className="ml-2 text-sm text-subtle">GEO Scan · Admin</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight ? "border-brand/30 bg-brand-soft/40" : "border-border bg-surface"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-subtle">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold text-ink">{value}</div>
      {sub ? <div className="text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-success/15 text-success",
    failed: "bg-danger/15 text-danger",
    scanning: "bg-warning/15 text-warning",
    pending: "bg-elevated text-muted",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-elevated text-muted"}`}
    >
      {status}
    </span>
  );
}

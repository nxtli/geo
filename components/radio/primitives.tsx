import * as React from "react";
import type { Confidence, Tier } from "@/lib/radio/types";
import { tierDef } from "@/lib/radio/scoring";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/radio/scoring/confidence";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Tier-badge met de emoji en kleur uit de briefing. */
export function TierBadge({ tier, className }: { tier: Tier | null; className?: string }) {
  if (!tier) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted",
          className,
        )}
      >
        nog niet gescoord
      </span>
    );
  }
  const def = tierDef(tier);
  const styles: Record<Tier, string> = {
    A: "border-success/40 bg-success/10 text-success",
    B: "border-brand/40 bg-brand/10 text-brand",
    C: "border-warning/40 bg-warning/10 text-warning",
    D: "border-border bg-background text-muted",
  };
  return (
    <span
      title={def.label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
        styles[tier],
        className,
      )}
    >
      <span aria-hidden>{def.emoji}</span> Tier {tier}
    </span>
  );
}

/** Grote score met een balk eronder. */
export function ScoreBlock({
  label,
  value,
  max = 100,
  hint,
  emphasis = false,
}: {
  label: string;
  value: number | null;
  max?: number;
  hint?: string;
  emphasis?: boolean;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={cn(
            "font-display font-semibold tabular-nums",
            emphasis ? "text-3xl text-ink" : "text-2xl text-ink",
          )}
        >
          {value === null ? "—" : value}
        </span>
        <span className="text-sm text-subtle">/ {max}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
        <div
          className={cn("h-full rounded-full", emphasis ? "bg-brand" : "bg-ink/40")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint ? <p className="mt-2 text-xs leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

/** Compacte score voor de tabel: getal met een dunne balk. */
export function MiniScore({ value, max = 100 }: { value: number | null; max?: number }) {
  if (value === null) return <span className="text-subtle">—</span>;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 text-right text-sm font-medium tabular-nums text-ink">{value}</span>
      <div className="h-1 w-10 overflow-hidden rounded-full bg-background">
        <div className="h-full rounded-full bg-ink/40" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Confidence-badge. Onder de drempel expliciet als waarschuwing. */
export function ConfidenceBadge({
  score,
  label,
}: {
  score: number | null;
  label: Confidence | null;
}) {
  if (score === null) {
    return <span className="text-xs text-subtle">geen research</span>;
  }
  const low = score < LOW_CONFIDENCE_THRESHOLD;
  const styles = low
    ? "border-danger/40 bg-danger/10 text-danger"
    : label === "high"
      ? "border-success/40 bg-success/10 text-success"
      : "border-warning/40 bg-warning/10 text-warning";
  return (
    <span
      title={
        low
          ? "Lage betrouwbaarheid — er is te weinig hard bewijs gevonden. Controleer dit voordat je belt."
          : `Research confidence ${score}/100`
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        styles,
      )}
    >
      {low ? "⚠ " : ""}
      {score}/100
    </span>
  );
}

/** Herkomst van een claim: fact / inference / unknown. */
export function BasisBadge({ basis }: { basis: "fact" | "inference" | "unknown" }) {
  const config = {
    fact: { label: "gevonden", className: "border-success/40 bg-success/10 text-success" },
    inference: { label: "inschatting", className: "border-warning/40 bg-warning/10 text-warning" },
    unknown: { label: "onbekend", className: "border-border bg-background text-muted" },
  }[basis];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}

/** DEMO DATA-markering, zodat fixtures nooit voor echt doorgaan. */
export function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
      demo data
    </span>
  );
}

/** Statistiektegel voor het dashboard. */
export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn";
}) {
  const valueTone = {
    default: "text-ink",
    good: "text-success",
    warn: "text-warning",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("mt-1 font-display text-2xl font-semibold tabular-nums", valueTone)}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

export function Card({
  title,
  action,
  className,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface", className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
            {title}
          </h2>
          {action}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Melding: neutraal, waarschuwing of fout. */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "error" | "success";
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-border bg-background text-muted",
    warn: "border-warning/40 bg-warning/10 text-warning",
    error: "border-danger/40 bg-danger/10 text-danger",
    success: "border-success/40 bg-success/10 text-success",
  }[tone];
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm leading-relaxed", styles)}>
      {children}
    </div>
  );
}

/** Knop met dezelfde vormtaal als de rest van de app. */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, children, ...rest },
  ref,
) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-4 py-2 text-sm" };
  const variants = {
    primary: "bg-brand text-brand-fg hover:opacity-90",
    secondary: "border border-border bg-surface text-ink hover:border-brand/40 hover:text-brand",
    ghost: "text-muted hover:text-ink",
    danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
  };
  return (
    <button
      ref={ref}
      className={cn(base, sizes[size], variants[variant], className)}
      {...rest}
    >
      {children}
    </button>
  );
});

/** Externe link met veilige rel-attributen. */
export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={cn("text-brand underline decoration-brand/30 hover:decoration-brand", className)}
    >
      {children}
    </a>
  );
}

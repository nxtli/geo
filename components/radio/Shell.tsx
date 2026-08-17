import Link from "next/link";
import { cn } from "./primitives";

/**
 * Layout-omhulsel voor alle /radio-pagina's. Bewust kaal: dit is een intern
 * werkscherm, geen landingspagina — snelheid van werken gaat voor uitstraling.
 */
export function Shell({
  title,
  subtitle,
  actions,
  storeLabel,
  providerLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  storeLabel?: string;
  providerLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto w-full max-w-[1400px] px-5 py-4 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-4">
              <Link href="/radio" className="font-display text-lg font-semibold text-ink">
                Adverteren op de Radio
              </Link>
              <span className="text-xs uppercase tracking-wide text-subtle">
                Prospect Finder
              </span>
            </div>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink href="/radio">Dashboard</NavLink>
              <NavLink href="/radio/zoeken">Zoeken</NavLink>
              <NavLink href="/radio/import">Toevoegen</NavLink>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-5 py-6 sm:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              {title}
            </h1>
            {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>

        {children}

        {storeLabel || providerLabel ? (
          <footer className="mt-10 border-t border-border pt-4 text-xs text-subtle">
            {storeLabel ? <span>Opslag: {storeLabel}</span> : null}
            {storeLabel && providerLabel ? <span className="mx-2">·</span> : null}
            {providerLabel ? <span>Research: {providerLabel}</span> : null}
          </footer>
        ) : null}
      </main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg px-3 py-1.5 text-muted transition-colors hover:bg-background hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

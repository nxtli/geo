import { Container } from "./primitives";
import { Logo } from "./Logo";

export function GeoFooter() {
  return (
    <footer className="border-t border-border py-10">
      <Container>
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo
              className="h-7 w-auto"
              fallbackClassName="font-display text-lg font-bold tracking-tight text-ink"
            />
            <span className="text-sm text-subtle">· GEO Scan</span>
          </div>
          <p className="max-w-md text-center text-xs leading-relaxed text-subtle sm:text-right">
            We gebruiken je gegevens alleen om je scan uit te voeren en je
            rapport toe te sturen. Geen spam.
          </p>
        </div>
        <div className="mt-6 text-center text-xs text-subtle sm:text-left">
          © {2026} NXTLI. Alle rechten voorbehouden.
        </div>
      </Container>
    </footer>
  );
}

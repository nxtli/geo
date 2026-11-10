"use client";

import { Container } from "./primitives";
import { Logo } from "./Logo";
import { useBrand } from "./brand-context";

export function GeoFooter() {
  const brand = useBrand();
  return (
    <footer className="border-t border-border py-10">
      <Container>
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo
              className="h-8 w-auto"
              fallbackClassName="font-display text-lg font-bold tracking-tight text-ink"
            />
            <span className="text-sm text-subtle">· {brand.logoSuffix}</span>
          </div>
          <p className="max-w-md text-center text-xs leading-relaxed text-subtle sm:text-right">
            We gebruiken je gegevens alleen om je scan uit te voeren en je
            rapport toe te sturen. Geen spam.
          </p>
        </div>
        <div className="mt-6 text-center text-xs text-subtle sm:text-left">
          {brand.footer.copyright}
          {brand.footer.poweredBy ? (
            <>
              {" · "}
              <a href="https://nxtli.com" className="underline">
                {brand.footer.poweredBy}
              </a>
            </>
          ) : null}
        </div>
      </Container>
    </footer>
  );
}

"use client";

import { Container } from "./primitives";
import { Logo } from "./Logo";
import { useBrand } from "./brand-context";
import { FOOTER, LANDING_UPDATED } from "@/lib/geo/landing";

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
            <span className="text-sm text-muted">· {brand.logoSuffix}</span>
          </div>
          <p className="max-w-md text-center text-xs leading-relaxed text-muted sm:text-right">{FOOTER.privacy}</p>
        </div>
        <div className="mt-6 space-y-1.5 text-center text-xs leading-relaxed text-muted sm:text-left">
          <p>
            <time dateTime={LANDING_UPDATED.iso}>{FOOTER.updated}</time>
            {brand.id === "mat" ? (
              <>
                {" · "}
                <a href="https://marketingaiteam.com" className="underline">
                  Naar de website van Marketing AI Team
                </a>
              </>
            ) : null}
            {" · "}
            <a href="https://nxtli.com" className="underline">
              Naar de website van NXTLI
            </a>
          </p>
          <p>{brand.footer.copyright}</p>
        </div>
      </Container>
    </footer>
  );
}

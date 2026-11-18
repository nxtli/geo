"use client";

import { GeoChatProvider, useGeoChat } from "./chat-context";
import { Button, Container } from "./primitives";
import { ArrowRightIcon } from "./icons";
import { Logo } from "./Logo";
import { GeoHero } from "./GeoHero";
import { GeoProblem } from "./GeoProblem";
import { GeoScanFeatures } from "./GeoScanFeatures";
import { GeoHowItWorks } from "./GeoHowItWorks";
import { GeoLimits } from "./GeoLimits";
import { GeoReportPreview } from "./GeoReportPreview";
import { WhyNxtli } from "./WhyNxtli";
import { GeoFAQ } from "./GeoFAQ";
import { GeoCTA } from "./GeoCTA";
import { GeoFooter } from "./GeoFooter";
import { useBrand } from "./brand-context";

const NAV_LINKS = [
  { href: "#waarom", label: "Waarom" },
  { href: "#wat-de-scan-beoordeelt", label: "Criteria" },
  { href: "#hoe-het-werkt", label: "Werkwijze" },
  { href: "#rapport", label: "Rapport" },
  { href: "#faq", label: "Vragen" },
];

/**
 * Kopbalk in de maten van marketingaiteam.com: 88 px hoog, logo 218 px breed,
 * menu 13 px. De waarden staan in app/globals.css onder .mat-header.
 */
function MatNavBar() {
  const { open } = useGeoChat();
  return (
    <header className="mat-header">
      <a href="#top" className="mat-brand" aria-label="Marketing AI Team, naar boven">
        <Logo className="mat-logo" />
      </a>
      <nav aria-label="Hoofdmenu">
        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
        <a href="https://marketingaiteam.com">Marketing AI Team</a>
      </nav>
      <button type="button" onClick={open} className="mat-header-cta">
        Scan mijn pagina <span aria-hidden="true">↗</span>
      </button>
    </header>
  );
}

function NavBar() {
  const { open } = useGeoChat();
  const brand = useBrand();
  if (brand.id === "mat") return <MatNavBar />;
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between">
        <a href="#top" className="flex items-center gap-2">
          <Logo className="h-9 w-auto" />
          <span className="hidden text-sm font-medium text-subtle sm:inline">
            {brand.logoSuffix}
          </span>
        </a>
        <Button size="md" onClick={open}>
          Scan mijn pagina <ArrowRightIcon className="h-4 w-4" />
        </Button>
      </Container>
    </header>
  );
}

export function GeoLandingPage() {
  return (
    <GeoChatProvider>
      <div id="top">
        <NavBar />
        <main>
          <GeoHero />
          {/* GeoSocialProof staat uit: het blok bevat voorbeeldcitaten en een voorbeeldaantal. Zet het terug met echte quotes en een echt aantal. */}
          <GeoProblem />
          <GeoScanFeatures />
          <GeoLimits />
          <GeoHowItWorks />
          <GeoReportPreview />
          <WhyNxtli />
          <GeoCTA />
          <GeoFAQ />
        </main>
        <GeoFooter />
      </div>
    </GeoChatProvider>
  );
}

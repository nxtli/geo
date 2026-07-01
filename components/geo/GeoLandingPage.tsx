"use client";

import { GeoChatProvider, useGeoChat } from "./chat-context";
import { Button, Container } from "./primitives";
import { ArrowRightIcon } from "./icons";
import { Logo } from "./Logo";
import { GeoHero } from "./GeoHero";
import { GeoSocialProof } from "./GeoSocialProof";
import { GeoProblem } from "./GeoProblem";
import { GeoScanFeatures } from "./GeoScanFeatures";
import { GeoHowItWorks } from "./GeoHowItWorks";
import { GeoReportPreview } from "./GeoReportPreview";
import { WhyNxtli } from "./WhyNxtli";
import { GeoFAQ } from "./GeoFAQ";
import { GeoCTA } from "./GeoCTA";
import { GeoFooter } from "./GeoFooter";

function NavBar() {
  const { open } = useGeoChat();
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between">
        <a href="#top" className="flex items-center gap-2">
          <Logo className="h-8 w-auto" />
          <span className="hidden text-sm font-medium text-subtle sm:inline">
            GEO Scan
          </span>
        </a>
        <Button size="md" onClick={open}>
          Scan mijn website <ArrowRightIcon className="h-4 w-4" />
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
          <GeoSocialProof />
          <GeoProblem />
          <GeoScanFeatures />
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

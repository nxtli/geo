import type { Metadata } from "next";
import { describeStore } from "@/lib/radio/store";
import { describeResearchProvider } from "@/lib/radio/research";
import { isDiscoveryAvailable } from "@/lib/radio/discovery";
import { Shell } from "@/components/radio/Shell";
import { DiscoveryPanel } from "@/components/radio/DiscoveryPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bedrijven zoeken — Adverteren op de Radio",
  robots: { index: false, follow: false },
};

export default function DiscoverPage() {
  const provider = describeResearchProvider();
  return (
    <Shell
      title="Bedrijven zoeken"
      subtitle="Laat de tool zelf Nederlandse bedrijven vinden, onderzoeken en op prioriteit zetten."
      storeLabel={describeStore()}
      providerLabel={provider.ai ? `${provider.id} (AI)` : `${provider.id} — trefwoord-heuristiek`}
    >
      <div className="max-w-4xl">
        <DiscoveryPanel available={isDiscoveryAvailable()} />
      </div>
    </Shell>
  );
}

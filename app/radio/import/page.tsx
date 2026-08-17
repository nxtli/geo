import type { Metadata } from "next";
import { describeStore } from "@/lib/radio/store";
import { describeResearchProvider } from "@/lib/radio/research";
import { Shell } from "@/components/radio/Shell";
import { ImportForms } from "@/components/radio/ImportForms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bedrijven toevoegen — Adverteren op de Radio",
  robots: { index: false, follow: false },
};

export default function ImportPage() {
  const provider = describeResearchProvider();
  return (
    <Shell
      title="Bedrijven toevoegen"
      subtitle="Handmatig, via CSV, of een hele lijst websites in één keer."
      storeLabel={describeStore()}
      providerLabel={provider.ai ? `${provider.id} (AI)` : `${provider.id} — trefwoord-heuristiek`}
    >
      <div className="max-w-4xl">
        <ImportForms />
      </div>
    </Shell>
  );
}

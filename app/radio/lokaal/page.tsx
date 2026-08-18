import type { Metadata } from "next";
import { describeStore } from "@/lib/radio/store";
import { Shell } from "@/components/radio/Shell";
import { LocalPanel } from "@/components/radio/LocalPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lokale bedrijven — Adverteren op de Radio",
  robots: { index: false, follow: false },
};

export default function LocalPage() {
  return (
    <Shell
      title="Lokale bedrijven"
      subtitle="Branche + provincie in, bellijst met LinkedIn-zoeklinks eruit. Zonder AI, zonder credits."
      storeLabel={describeStore()}
    >
      <div className="max-w-4xl">
        <LocalPanel />
      </div>
    </Shell>
  );
}

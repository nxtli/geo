import type { Metadata } from "next";
import { describeStore, listRuns } from "@/lib/radio/store";
import { Shell } from "@/components/radio/Shell";
import { RunHistory } from "@/components/radio/RunHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Historie — Adverteren op de Radio",
  robots: { index: false, follow: false },
};

export default async function RunHistoryPage() {
  const runs = await listRuns(100);
  return (
    <Shell
      title="Historie"
      subtitle="Elke zoek- en onderzoeksronde, met wat die opleverde en wat die kostte."
      storeLabel={describeStore()}
    >
      <RunHistory runs={runs} />
    </Shell>
  );
}

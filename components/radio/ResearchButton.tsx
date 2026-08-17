"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Notice } from "./primitives";

/**
 * "Research & Score" op de detailpagina.
 *
 * Rapporteert eerlijk waarop het resultaat rust: hoeveel bronnen er zijn
 * opgehaald, of er bronnen verworpen zijn omdat ze niet verifieerbaar waren, en
 * of er op de heuristiek is teruggevallen.
 */
export function ResearchButton({
  prospectId,
  hasScore,
}: {
  prospectId: string;
  hasScore: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{
    tone: "info" | "error" | "success";
    text: string;
  } | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(`/api/radio/prospects/${prospectId}/research`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setResult({ tone: "error", text: data.error ?? "De analyse is mislukt." });
        return;
      }

      const notes: string[] = [
        data.source_count === 0
          ? "Geen publieke pagina's opgehaald."
          : `${data.source_count} pagina('s) opgehaald.`,
      ];
      if (data.rejected_sources?.length) {
        notes.push(
          `${data.rejected_sources.length} bron(nen) verworpen omdat die niet in de opgehaalde pagina's voorkwamen.`,
        );
      }
      if (data.degraded) notes.push("Teruggevallen op de trefwoord-heuristiek.");
      if (data.warning) notes.push(data.warning);

      setResult({
        tone: data.warning || data.degraded ? "info" : "success",
        text: `Priority ${data.prospect.priority_score} (tier ${data.prospect.tier}) — ${notes.join(" ")}`,
      });
      router.refresh();
    } catch {
      setResult({ tone: "error", text: "Kon de analyse niet starten." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={run} disabled={busy} size="sm">
        {busy ? "Onderzoekt…" : hasScore ? "Opnieuw onderzoeken" : "Research & Score"}
      </Button>
      {result ? (
        <div className="max-w-md">
          <Notice tone={result.tone}>{result.text}</Notice>
        </div>
      ) : null}
    </div>
  );
}

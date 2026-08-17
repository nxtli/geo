"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Notice } from "./primitives";

/**
 * Acties in de dashboardkop: alles onderzoeken wat nog geen score heeft, en
 * DEMO DATA plaatsen of opruimen.
 *
 * Een grote batch wordt in RONDES verwerkt: de API doet maximaal 25 bedrijven
 * per aanroep om binnen de platform-timeout te blijven, en deze component
 * blijft rondes sturen zolang er nog iets te doen is. Zo kan Eric 100 websites
 * in één keer klaarzetten zonder dat de request sneuvelt.
 */
export function DashboardActions({
  unresearchedCount,
  demoCount,
}: {
  unresearchedCount: number;
  demoCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{
    tone: "info" | "error" | "success";
    text: string;
  } | null>(null);

  const researchAll = async () => {
    setBusy("research");
    setMessage(null);
    let totalDone = 0;
    let totalFailed = 0;

    try {
      // Blijf rondes sturen tot de API meldt dat er niets meer wacht.
      for (let round = 0; round < 40; round++) {
        setProgress(
          totalDone === 0
            ? "Onderzoek gestart…"
            : `${totalDone} onderzocht, volgende ronde…`,
        );
        const response = await fetch("/api/radio/research/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "unresearched" }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          setMessage({ tone: "error", text: data.error ?? "De batch-analyse is mislukt." });
          return;
        }
        totalDone += data.summary?.researched ?? 0;
        totalFailed += data.summary?.failed ?? 0;
        router.refresh();

        if (!data.remaining || data.remaining === 0) break;
        // Niets gelukt in deze ronde: stoppen in plaats van eindeloos herhalen.
        if ((data.summary?.researched ?? 0) === 0) break;
      }

      setMessage({
        tone: totalFailed > 0 ? "info" : "success",
        text:
          `${totalDone} bedrijven onderzocht en gescoord.` +
          (totalFailed > 0 ? ` ${totalFailed} mislukt — probeer die los opnieuw.` : ""),
      });
    } catch {
      setMessage({ tone: "error", text: "Kon de batch-analyse niet uitvoeren." });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const demo = async (method: "POST" | "DELETE") => {
    setBusy("demo");
    setMessage(null);
    try {
      const response = await fetch("/api/radio/demo", { method });
      const data = await response.json();
      setMessage({
        tone: data.ok ? "success" : "error",
        text: data.message ?? data.error ?? "Klaar.",
      });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Actie mislukt." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {unresearchedCount > 0 ? (
          <Button size="sm" onClick={researchAll} disabled={busy !== null}>
            {busy === "research"
              ? (progress ?? "Bezig…")
              : `Onderzoek ${unresearchedCount} nieuwe`}
          </Button>
        ) : null}
        <Link href="/radio/zoeken">
          <Button size="sm" variant={unresearchedCount > 0 ? "secondary" : "primary"}>
            Bedrijven zoeken
          </Button>
        </Link>
        <Link href="/radio/import">
          <Button size="sm" variant="secondary">
            Zelf toevoegen
          </Button>
        </Link>
        {demoCount > 0 ? (
          <Button size="sm" variant="danger" onClick={() => demo("DELETE")} disabled={busy !== null}>
            Demo-data wissen
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => demo("POST")} disabled={busy !== null}>
            Demo-data laden
          </Button>
        )}
      </div>
      {message ? (
        <div className="max-w-md">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      ) : null}
    </div>
  );
}

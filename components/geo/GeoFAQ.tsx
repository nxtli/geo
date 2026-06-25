"use client";

import * as React from "react";
import { Container, SectionHeading } from "./primitives";

const FAQS = [
  {
    q: "Wat is AI-vindbaarheid (GEO) precies?",
    a: "GEO staat voor Generative Engine Optimization. Het gaat erom dat je website begrepen, samengevat en aanbevolen wordt door AI-tools zoals ChatGPT, Claude, Perplexity en Google AI Overviews — niet alleen dat je in Google rankt.",
  },
  {
    q: "Is de scan echt gratis?",
    a: "Ja. Je krijgt gratis een AI Visibility Score en concrete verbeterpunten. Geen verplichtingen, geen technische kennis nodig.",
  },
  {
    q: "Wat heb ik nodig om te starten?",
    a: "Alleen de URL van je homepage en een paar antwoorden over je aanbod en doelgroep. Brian leidt je er stap voor stap doorheen.",
  },
  {
    q: "Hoe lang duurt het?",
    a: "Meestal niet langer dan een minuutje. Je ziet de uitkomst direct in de chat en ontvangt het volledige rapport per e-mail.",
  },
  {
    q: "Wat gebeurt er met mijn gegevens?",
    a: "We gebruiken je gegevens alleen om de scan uit te voeren en je rapport toe te sturen. Geen spam.",
  },
  {
    q: "Is dit rapport een opmaat naar een verkoopgesprek?",
    a: "Nee. Je krijgt een volledig rapport met concrete verbeterpunten — ook als je daarna niks met NXTLI doet. We geloven dat je eerst waarde moet ervaren voordat je ook maar één beslissing neemt.",
  },
];

export function GeoFAQ() {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  return (
    <section className="bg-elevated/50 py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Veelgestelde vragen"
          title="Veelgestelde vragen — eerlijk beantwoord"
        />

        <div className="mx-auto mt-10 max-w-2xl divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {FAQS.map((f, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={f.q}>
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="font-medium text-ink">{f.q}</span>
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-muted transition-transform duration-200 ${
                      isOpen ? "rotate-45" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
                <div
                  className={`grid overflow-hidden px-6 transition-all duration-300 ${
                    isOpen ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="text-sm leading-relaxed text-muted">{f.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

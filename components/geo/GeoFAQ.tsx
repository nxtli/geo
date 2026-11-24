"use client";

import * as React from "react";
import { Container, SectionHeading } from "./primitives";
import { FAQ_HEADING, faqs } from "@/lib/geo/landing";
import { useBrand } from "./brand-context";

/**
 * Veelgestelde vragen. De antwoorden staan altijd in de HTML, ook als een
 * vraag dicht is. Zo leest een zoekmachine of AI-tool ze zonder te klikken.
 */
export function GeoFAQ() {
  const brand = useBrand();
  const items = faqs(brand.name);
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-24 py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow={FAQ_HEADING.eyebrow} title={FAQ_HEADING.title} />

        <div className="mx-auto mt-10 max-w-2xl divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {items.map((f, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={f.q}>
                <h3>
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-${i}`}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  >
                    <span className="font-medium text-ink">{f.q}</span>
                    <span
                      aria-hidden="true"
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-muted transition-transform duration-200 ${
                        isOpen ? "rotate-45" : ""
                      }`}
                    >
                      +
                    </span>
                  </button>
                </h3>
                <div
                  id={`faq-${i}`}
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

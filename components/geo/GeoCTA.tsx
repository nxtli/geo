"use client";

import { Button, Container } from "./primitives";
import { ArrowRightIcon } from "./icons";
import { useGeoChat } from "./chat-context";

export function GeoCTA() {
  const { open } = useGeoChat();

  return (
    <section className="py-20 sm:py-28">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-ink px-7 py-14 text-center sm:px-12 sm:py-20">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-brand/30 blur-3xl" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Terwijl jij dit leest, geeft AI al antwoorden aan jouw klanten
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/70">
              De vraag is niet óf AI jouw concurrenten noemt. De vraag is of ze
              jou ook noemen. Binnen 5 minuten weet je waar je staat — en wat je
              kunt verbeteren.
            </p>

            <div className="mt-8 flex justify-center">
              <Button
                size="lg"
                onClick={open}
                className="bg-white text-ink hover:bg-white hover:shadow-[0_18px_60px_rgba(255,255,255,0.25)]"
              >
                Ja, scan mijn website <ArrowRightIcon className="h-4 w-4" />
              </Button>
            </div>

            <p className="mt-4 text-sm text-white/55">
              Gratis. Geen technische kennis nodig. Je ontvangt direct concrete
              verbeterpunten — of je nu verder gaat met NXTLI of niet.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}

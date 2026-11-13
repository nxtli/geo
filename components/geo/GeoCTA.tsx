"use client";

import { Button, Container } from "./primitives";
import { ArrowRightIcon } from "./icons";
import { useGeoChat } from "./chat-context";
import { useBrand } from "./brand-context";
import { FINAL_CTA } from "@/lib/geo/landing";

export function GeoCTA() {
  const { open } = useGeoChat();
  const brand = useBrand();

  return (
    <section className="bg-elevated/50 pb-20 sm:pb-28">
      <Container>
        <div className="geo-cta-panel relative overflow-hidden rounded-3xl bg-ink px-7 py-14 text-center sm:px-12 sm:py-20">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-brand/30 blur-3xl" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {FINAL_CTA.title}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/80">{FINAL_CTA.body}</p>

            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                onClick={open}
                className="bg-white text-ink hover:bg-white hover:shadow-[0_18px_60px_rgba(255,255,255,0.25)]"
              >
                {FINAL_CTA.cta} <ArrowRightIcon className="h-4 w-4" />
              </Button>
            </div>

            <p className="mt-5 text-sm text-white/70">{FINAL_CTA.trust}</p>

            <p className="mx-auto mt-8 max-w-xl border-t border-white/20 pt-6 text-base text-white/90">
              {FINAL_CTA.more}{" "}
              <a
                href={FINAL_CTA.waitlist.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white"
              >
                {FINAL_CTA.waitlist.label}
              </a>{" "}
              of{" "}
              <a
                href={brand.cta.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white"
              >
                vraag een demo aan
              </a>
              .
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}

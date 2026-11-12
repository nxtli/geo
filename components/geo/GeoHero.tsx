"use client";

import * as React from "react";
import { Button, Container, Eyebrow } from "./primitives";
import { ArrowRightIcon, CheckIcon, SparkIcon } from "./icons";
import { useGeoChat } from "./chat-context";
import { CharlieAvatar } from "./CharlieAvatar";
import { CHARLIE } from "@/lib/geo/charlie";
import { HERO } from "@/lib/geo/landing";
import { useBrand } from "./brand-context";

export function GeoHero() {
  const { open } = useGeoChat();
  const brand = useBrand();

  return (
    <section className="geo-hero relative overflow-hidden">
      <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />

      <Container className="relative pb-16 pt-14 sm:pb-24 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-fade-up">
            <Eyebrow>
              <SparkIcon className="h-3.5 w-3.5" /> {brand.id === "mat" ? "Marketing AI Team · GEO-scan" : brand.product}
            </Eyebrow>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl">
              {HERO.title}{" "}
              <span className="bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">
                {HERO.titleAccent}
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{HERO.lede}</p>

            <ul className="mt-6 max-w-xl space-y-2.5">
              {HERO.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-base text-ink">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                    <CheckIcon className="h-3.5 w-3.5" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" onClick={open}>
                {HERO.cta} <ArrowRightIcon className="h-4 w-4" />
              </Button>
              <a
                href="#rapport"
                className="inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-3.5 text-base font-semibold text-ink transition-colors hover:text-brand"
              >
                {HERO.secondary}
              </a>
            </div>

            <p className="mt-4 max-w-md text-sm text-muted">{HERO.trust}</p>
          </div>

          <div className="animate-fade-up [animation-delay:120ms]">
            <HeroChatPreview onStart={open} role={brand.charlie.role} cta={HERO.cta} />
          </div>
        </div>
      </Container>
    </section>
  );
}

/** Voorbeeld van het gesprek. Decoratief: een schermlezer slaat het over en gaat naar de knop. */
function HeroChatPreview({ onStart, role, cta }: { onStart: () => void; role: string; cta: string }) {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand/15 to-accent/10 blur-2xl" />
      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-lift">
        <div aria-hidden="true">
          <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
            <CharlieAvatar size="md" withStatus />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-ink">{CHARLIE.name}</div>
              <div className="text-xs text-muted">{role}</div>
            </div>
          </div>

          <div className="space-y-3 px-5 py-5">
            <Bubble from="charlie">Welke pagina wil je laten scannen?</Bubble>
            <Bubble from="user">jouwbedrijf.nl/dienst</Bubble>
            <Bubble from="charlie">Ik heb de pagina. Wat verkoop of bied je aan?</Bubble>

            <div className="rounded-2xl border border-border bg-elevated/60 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-brand">Paginascore (voorbeeld)</span>
                <span className="font-bold text-ink">52/100</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                <div className="h-full w-[52%] rounded-full bg-gradient-to-r from-brand to-accent" />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 py-3">
          <button
            onClick={onStart}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg transition-all hover:shadow-glow"
          >
            {cta} <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ from, children }: { from: "charlie" | "user"; children: React.ReactNode }) {
  const isCharlie = from === "charlie";
  return (
    <div className={isCharlie ? "flex justify-start" : "flex justify-end"}>
      <div
        className={
          isCharlie
            ? "max-w-[85%] rounded-2xl rounded-bl-md bg-elevated px-3.5 py-2 text-[13px] leading-relaxed text-ink"
            : "max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-[13px] leading-relaxed text-brand-fg"
        }
      >
        {children}
      </div>
    </div>
  );
}

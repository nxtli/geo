"use client";

import * as React from "react";
import { Button, Container, Eyebrow } from "./primitives";
import { ArrowRightIcon, SparkIcon } from "./icons";
import { useGeoChat } from "./chat-context";
import { BRIAN } from "@/lib/geo/brian";

export function GeoHero() {
  const { open } = useGeoChat();

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />

      <Container className="relative pb-16 pt-14 sm:pb-24 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-fade-up">
            <Eyebrow>
              <SparkIcon className="h-3.5 w-3.5" /> NXTLI GEO Scan
            </Eyebrow>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Wil jij gevonden worden in{" "}
              <span className="bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">
                AI-zoekresultaten?
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Ontdek gratis hoe goed jouw website zichtbaar is voor ChatGPT,
              Claude en andere AI-antwoorden — en wat je kunt verbeteren om
              vaker genoemd te worden.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" onClick={open}>
                Ja, scan mijn website <ArrowRightIcon className="h-4 w-4" />
              </Button>
              <a
                href="#wat-de-scan-analyseert"
                className="inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-3.5 text-base font-semibold text-ink transition-colors hover:text-brand"
              >
                Bekijk wat de scan analyseert
              </a>
            </div>

            <p className="mt-4 text-sm text-subtle">
              Gratis scan. Binnen enkele minuten inzicht. Geen verplichtingen.
            </p>
          </div>

          <div className="animate-fade-up [animation-delay:120ms]">
            <HeroChatPreview onStart={open} />
          </div>
        </div>
      </Container>
    </section>
  );
}

function HeroChatPreview({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand/15 to-accent/10 blur-2xl" />
      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-lift">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-fg">
            {BRIAN.avatarInitial}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-success" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink">{BRIAN.name}</div>
            <div className="text-xs text-muted">AI-analist · online</div>
          </div>
        </div>

        <div className="space-y-3 px-5 py-5">
          <Bubble from="brian">
            Tof! Ik ben Brian. Ik bekijk in een paar stappen hoe goed jouw
            homepage vindbaar is in AI-antwoorden.
          </Bubble>
          <Bubble from="brian">Wat is de URL van je homepage?</Bubble>
          <Bubble from="user">jouwbedrijf.nl</Bubble>
          <Bubble from="brian">Mooi, ik heb je website. ✨</Bubble>

          <div className="rounded-2xl border border-border bg-elevated/60 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-brand">AI Visibility Score</span>
              <span className="font-bold text-ink">68/100</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
              <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-brand to-accent" />
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 py-3">
          <button
            onClick={onStart}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg transition-all hover:shadow-glow"
          >
            Start jouw gratis scan <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  from,
  children,
}: {
  from: "brian" | "user";
  children: React.ReactNode;
}) {
  const isBrian = from === "brian";
  return (
    <div className={isBrian ? "flex justify-start" : "flex justify-end"}>
      <div
        className={
          isBrian
            ? "max-w-[85%] rounded-2xl rounded-bl-md bg-elevated px-3.5 py-2 text-[13px] leading-relaxed text-ink"
            : "max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-[13px] leading-relaxed text-brand-fg"
        }
      >
        {children}
      </div>
    </div>
  );
}

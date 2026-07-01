"use client";

import * as React from "react";
import {
  BRIAN,
  BRIAN_COPY,
  BRIAN_PROCESSING_STEPS,
  BRIAN_STEPS,
  TOTAL_PROGRESS_STEPS,
} from "@/lib/geo/brian";
import type { GeoLeadInput, GeoScanResponse } from "@/lib/geo/types";
import { ChatMessage, TypingIndicator, type ChatMessageData } from "./ChatMessage";
import { BrianAvatar } from "./BrianAvatar";
import { Button, cn } from "./primitives";
import { ArrowRightIcon, CheckIcon, CloseIcon, DocIcon, SendIcon } from "./icons";

type Phase = "asking" | "consent" | "scanning" | "success" | "error";

const STRATEGY_URL =
  process.env.NEXT_PUBLIC_GEO_STRATEGY_CALL_URL || "https://nxtli.com";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let msgSeq = 0;
const nextId = () => `m${++msgSeq}`;

export function BrianChat({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = React.useState<ChatMessageData[]>([]);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<Partial<GeoLeadInput>>({});
  const [phase, setPhase] = React.useState<Phase>("asking");
  const [input, setInput] = React.useState("");
  const [inputError, setInputError] = React.useState<string | null>(null);
  const [typing, setTyping] = React.useState(false);
  const [consent, setConsent] = React.useState(false);
  const [processingIndex, setProcessingIndex] = React.useState(0);
  const [scanProgress, setScanProgress] = React.useState(0);
  const [result, setResult] = React.useState<GeoScanResponse | null>(null);

  const initialized = React.useRef(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const pushBrian = React.useCallback(async (text: string, delay = 650) => {
    setTyping(true);
    await wait(delay);
    setTyping(false);
    setMessages((m) => [...m, { id: nextId(), from: "brian", text }]);
  }, []);

  // Seed the intro + first question the first time the chat is opened.
  React.useEffect(() => {
    if (!isOpen || initialized.current) return;
    initialized.current = true;
    (async () => {
      await pushBrian(BRIAN.intro, 350);
      await pushBrian(BRIAN_STEPS[0].prompt, 700);
    })();
  }, [isOpen, pushBrian]);

  // Keep the latest message in view.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typing, phase, processingIndex]);

  // Focus the field when a new question is ready.
  React.useEffect(() => {
    if (isOpen && phase === "asking" && !typing) inputRef.current?.focus();
  }, [isOpen, phase, typing, stepIndex]);

  // Lock body scroll while the modal is open.
  React.useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  async function handleSend() {
    if (phase !== "asking" || typing) return;
    const step = BRIAN_STEPS[stepIndex];
    const value = input.trim();

    if (!value && !step.optional) {
      setInputError("Vul dit even in om verder te gaan.");
      return;
    }
    if (value && step.validate) {
      const err = step.validate(value);
      if (err) {
        setInputError(err);
        return;
      }
    }

    setInputError(null);
    setInput("");
    const displayed = value || "overgeslagen";
    setMessages((m) => [...m, { id: nextId(), from: "user", text: displayed }]);
    setAnswers((a) => ({ ...a, [step.key]: value || null }));

    if (step.ack && value) await pushBrian(step.ack(value), 500);

    const next = stepIndex + 1;
    if (next < BRIAN_STEPS.length) {
      setStepIndex(next);
      await pushBrian(BRIAN_STEPS[next].prompt, 650);
    } else {
      setStepIndex(next);
      setPhase("consent");
      await pushBrian(BRIAN_COPY.reviewLead, 600);
    }
  }

  async function startScan() {
    if (!consent) return;
    setPhase("scanning");
    setProcessingIndex(0);
    setScanProgress(0);
    await pushBrian(BRIAN_COPY.scanningLead, 300);

    const stepCount = BRIAN_PROCESSING_STEPS.length;

    // The server streams real progress events (fetch → analyse-token-stream →
    // report). We ease the displayed bar toward the latest real target so it
    // always drifts forward, but never overshoots actual progress.
    let target = 0;
    let shown = 0;
    let finished = false;
    const creep = setInterval(() => {
      if (finished) return;
      const goal = Math.min(target, 99);
      if (shown < goal) {
        shown = Math.min(goal, shown + Math.max(0.25, (goal - shown) * 0.07));
        setScanProgress(Math.round(shown));
      }
    }, 180);
    const stop = () => {
      finished = true;
      clearInterval(creep);
    };

    const payload: GeoLeadInput = {
      name: answers.name ?? "",
      email: answers.email ?? "",
      phone: answers.phone ?? "",
      job_title: answers.job_title ?? "",
      company_name: answers.company_name ?? "",
      homepage_url: answers.homepage_url ?? "",
      offer_description: answers.offer_description ?? "",
      target_audience: answers.target_audience ?? "",
      desired_queries: answers.desired_queries ?? "",
      competitors: answers.competitors ?? null,
      consent: true,
    };

    type Final =
      | { ok: true; data: GeoScanResponse }
      | { ok: false; message?: string };
    let final: Final | null = null;

    try {
      const res = await fetch("/api/geo/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("no_stream");
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let evt: {
            type: string;
            pct?: number;
            step?: number;
            data?: GeoScanResponse;
            message?: string;
          };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.type === "progress") {
            if (typeof evt.pct === "number") target = Math.max(target, evt.pct);
            if (typeof evt.step === "number") setProcessingIndex(evt.step);
          } else if (evt.type === "result" && evt.data) {
            final = { ok: true, data: evt.data };
          } else if (evt.type === "error") {
            final = { ok: false, message: evt.message };
          }
        }
      }

      stop();
      setScanProgress(100);
      setProcessingIndex(stepCount);
      await wait(450);

      if (!final || !final.ok) {
        setPhase("error");
        await pushBrian(final?.message ?? BRIAN_COPY.errorFallback, 500);
        return;
      }

      const data = final.data;
      setResult(data);
      setPhase("success");
      // Surface the server's user-safe message when present (account-level gate,
      // degraded run); otherwise the standard "scan is klaar" copy.
      await pushBrian(data.message ?? BRIAN_COPY.successLead, 500);
      if (!data.blocked) {
        if (data.email_queued) {
          await pushBrian(BRIAN_COPY.emailNote(payload.email), 500);
        }
        await pushBrian(BRIAN_COPY.finalCta, 600);
      }
    } catch {
      stop();
      setPhase("error");
      await pushBrian(BRIAN_COPY.errorFallback, 400);
    }
  }

  function retry() {
    setPhase("consent");
    setInputError(null);
  }

  if (!isOpen) return null;

  const step = BRIAN_STEPS[stepIndex];
  const progress = Math.min(stepIndex + (phase === "asking" ? 1 : 0), TOTAL_PROGRESS_STEPS);
  const progressPct = Math.round(
    (Math.min(stepIndex + (phase === "consent" || phase === "success" ? 1 : 0), TOTAL_PROGRESS_STEPS) /
      TOTAL_PROGRESS_STEPS) *
      100,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Chat met Brian, de AI-analist van NXTLI"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-lift animate-fade-up sm:h-[640px] sm:max-w-md sm:rounded-3xl">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-3">
            <BrianAvatar size="md" withStatus />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-ink">{BRIAN.name}</div>
              <div className="text-xs text-muted">{BRIAN.role}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Sluiten"
            className="rounded-full p-2 text-muted transition-colors hover:bg-elevated hover:text-ink"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        {/* Progress */}
        {phase !== "success" && phase !== "error" ? (
          <div className="px-5 pt-3">
            <div className="flex items-center justify-between text-[11px] font-medium text-subtle">
              <span>
                {phase === "consent" || phase === "scanning"
                  ? "Bijna klaar"
                  : `Vraag ${progress} van ${TOTAL_PROGRESS_STEPS}`}
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* Messages */}
        <div
          ref={scrollRef}
          className="scroll-thin flex-1 space-y-3 overflow-y-auto px-5 py-4"
        >
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}
          {typing && <TypingIndicator />}

          {phase === "scanning" && (
            <ProcessingList activeIndex={processingIndex} progress={scanProgress} />
          )}
          {phase === "success" && result?.preview ? (
            <ResultCard result={result} />
          ) : null}
          {phase === "error" && (
            <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm text-ink">
              <p className="font-medium">We pakken het handmatig op</p>
              <p className="mt-1 text-muted">
                Je aanvraag is ontvangen. Wil je het toch nog eens proberen?
              </p>
              <Button size="md" variant="secondary" className="mt-3" onClick={retry}>
                Opnieuw proberen
              </Button>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-border bg-surface px-4 py-3">
          {phase === "asking" && (
            <AskingInput
              ref={inputRef}
              step={step}
              value={input}
              error={inputError}
              disabled={typing}
              onChange={(v) => {
                setInput(v);
                if (inputError) setInputError(null);
              }}
              onSend={handleSend}
            />
          )}

          {phase === "consent" && (
            <ConsentInput
              consent={consent}
              onToggle={() => setConsent((c) => !c)}
              onStart={startScan}
            />
          )}

          {phase === "scanning" && (
            <p className="px-1 py-2 text-center text-xs text-subtle">
              {BRIAN_COPY.scanningSubtle}
            </p>
          )}

          {phase === "success" && result?.report_url && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <a
                href={result.report_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-brand-fg shadow-soft transition-all hover:shadow-glow"
              >
                <DocIcon className="h-4 w-4" /> Bekijk je rapport
              </a>
              <a
                href={STRATEGY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-brand/40 hover:text-brand"
              >
                Plan een sessie <ArrowRightIcon className="h-4 w-4" />
              </a>
            </div>
          )}

          {phase === "error" && (
            <a
              href={STRATEGY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-brand/40 hover:text-brand"
            >
              Neem contact op met NXTLI <ArrowRightIcon className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

const AskingInput = React.forwardRef<
  HTMLTextAreaElement,
  {
    step: (typeof BRIAN_STEPS)[number];
    value: string;
    error: string | null;
    disabled: boolean;
    onChange: (v: string) => void;
    onSend: () => void;
  }
>(function AskingInput({ step, value, error, disabled, onChange, onSend }, ref) {
  return (
    <div>
      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl border bg-surface px-3 py-2 transition-colors",
          error ? "border-danger" : "border-border focus-within:border-brand/50",
        )}
      >
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={step.placeholder}
          inputMode={step.inputType === "email" ? "email" : "text"}
          onChange={(e) => {
            onChange(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          className="max-h-[120px] flex-1 resize-none bg-transparent py-1.5 text-[15px] text-ink outline-none placeholder:text-subtle"
        />
        <button
          onClick={onSend}
          disabled={disabled}
          aria-label="Versturen"
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg transition-all hover:shadow-glow disabled:opacity-50"
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </div>
      {error ? (
        <p className="mt-1.5 px-1 text-xs font-medium text-danger">{error}</p>
      ) : (
        <p className="mt-1.5 px-1 text-[11px] text-subtle">
          {step.optional ? "Optioneel, druk op Enter om over te slaan" : "Druk op Enter om te versturen"}
        </p>
      )}
    </div>
  );
});

function ConsentInput({
  consent,
  onToggle,
  onStart,
}: {
  consent: boolean;
  onToggle: () => void;
  onStart: () => void;
}) {
  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand"
        />
        <span>{BRIAN_COPY.consentLabel}</span>
      </label>
      <Button
        size="lg"
        className="w-full"
        disabled={!consent}
        onClick={onStart}
      >
        Ja, scan mijn website <ArrowRightIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ProcessingList({
  activeIndex,
  progress,
}: {
  activeIndex: number;
  progress: number;
}) {
  const activeStep = BRIAN_PROCESSING_STEPS[Math.min(activeIndex, BRIAN_PROCESSING_STEPS.length - 1)];
  return (
    <div className="animate-fade-up rounded-2xl border border-border bg-elevated/60 p-4">
      {/* Overall progress bar */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-medium text-ink">Bezig met scannen…</span>
          <span className="tabular-nums text-subtle">{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        {activeStep && progress < 100 ? (
          <p className="mt-2 animate-fade-in text-xs text-muted">{activeStep.detail}</p>
        ) : null}
      </div>

      <ul className="space-y-2.5">
        {BRIAN_PROCESSING_STEPS.map((step, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li key={step.label} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                  done && "border-success bg-success text-white",
                  active && "border-brand text-brand",
                  !done && !active && "border-border text-subtle",
                )}
              >
                {done ? (
                  <CheckIcon className="h-3 w-3" />
                ) : active ? (
                  <span className="h-2 w-2 animate-bounce-dot rounded-full bg-brand" />
                ) : null}
              </span>
              <span
                className={cn(
                  done
                    ? "text-muted line-through decoration-subtle/60"
                    : active
                      ? "font-medium text-ink"
                      : "text-subtle",
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ResultCard({ result }: { result: GeoScanResponse }) {
  const p = result.preview!;
  const score = p.visibility_score;
  const tone =
    score >= 70 ? "text-success" : score >= 45 ? "text-warning" : "text-danger";
  return (
    <div className="animate-fade-up space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className={cn("font-display text-4xl font-bold leading-none", tone)}>
            {score}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-subtle">/ 100</div>
        </div>
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand">
            AI Visibility Score
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-accent"
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-muted">{p.short_summary}</p>
      {p.category_scores?.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-semibold text-ink">Opbouw van de score</div>
          <ul className="space-y-1.5">
            {p.category_scores.map((c) => (
              <li key={c.key || c.label} className="flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0 truncate text-muted" title={c.label}>
                  {c.label}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-brand to-accent"
                    style={{ width: `${Math.round((c.score / Math.max(1, c.max)) * 100)}%` }}
                  />
                </span>
                <span className="w-10 shrink-0 text-right font-medium text-ink">
                  {c.score}/{c.max}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.quick_wins.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-semibold text-ink">Quick wins</div>
          <ul className="space-y-1.5">
            {p.quick_wins.map((w, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

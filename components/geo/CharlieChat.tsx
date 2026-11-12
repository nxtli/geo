"use client";

import * as React from "react";
import {
  CHARLIE,
  CHARLIE_COPY,
  CHARLIE_PROCESSING_STEPS,
  CHARLIE_STEPS,
  MAX_FOLLOW_UPS,
  TOTAL_PROGRESS_STEPS,
  needsCharlieReply,
} from "@/lib/geo/charlie";
import type { GeoLeadInput, GeoScanResponse } from "@/lib/geo/types";
import { suggestEmailFix } from "@/lib/geo/email-typo";
import { fieldValidators } from "@/lib/geo/validation";
import { ChatMessage, TypingIndicator, type ChatMessageData } from "./ChatMessage";
import { CharlieAvatar } from "./CharlieAvatar";
import { Button, cn } from "./primitives";
import { useBrand } from "./brand-context";
import { ArrowRightIcon, CheckIcon, CloseIcon, DocIcon, SendIcon } from "./icons";

type Phase = "asking" | "consent" | "scanning" | "success" | "error" | "closed";

const DEFAULT_STRATEGY_URL =
  process.env.NEXT_PUBLIC_GEO_STRATEGY_CALL_URL ||
  "https://nxtli.com/michiel-schoonhoven-agenda/";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let msgSeq = 0;
const nextId = () => `m${++msgSeq}`;

export function CharlieChat({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const brand = useBrand();
  const STRATEGY_URL = brand.id === "nxtli" ? DEFAULT_STRATEGY_URL : brand.cta.url;
  const [messages, setMessages] = React.useState<ChatMessageData[]>([]);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<Partial<GeoLeadInput>>({});
  const [phase, setPhase] = React.useState<Phase>("asking");
  const [input, setInput] = React.useState("");
  const [inputError, setInputError] = React.useState<string | null>(null);
  const [typing, setTyping] = React.useState(false);
  // Charlie vroeg door bij deze stap: wat er al genoteerd is en hoe vaak.
  const [pending, setPending] = React.useState<string | null>(null);
  const [followUps, setFollowUps] = React.useState(0);
  // Wat Charlie bij deze stap als laatste zei, zodat een kort "prima" context heeft.
  const [lastReply, setLastReply] = React.useState<string | null>(null);
  // Charlie vroeg of een e-mailadres met een waarschijnlijke tikfout klopt.
  const [emailCheck, setEmailCheck] = React.useState<{ original: string; suggestion: string } | null>(null);
  // Met dit adres is al een scan gedaan. Charlie wacht op "ja" of een ander adres.
  const [priorEmail, setPriorEmail] = React.useState<string | null>(null);
  const [consent, setConsent] = React.useState(false);
  const [processingIndex, setProcessingIndex] = React.useState(0);
  const [scanProgress, setScanProgress] = React.useState(0);
  const [result, setResult] = React.useState<GeoScanResponse | null>(null);
  // Link naar het rapport. Standaard de server-URL; werkt die niet (geen
  // database, andere serverinstantie), dan een lokale kopie van het rapport.
  const [reportHref, setReportHref] = React.useState<string | null>(null);
  React.useEffect(() => {
    const url = result?.report_url ?? null;
    const html = result?.report_html;
    setReportHref(url);
    if (!url || !html) return;
    let blobUrl: string | null = null;
    let cancelled = false;
    fetch(url, { method: "GET", cache: "no-store" })
      .then((res) => res.ok)
      .catch(() => false)
      .then((ok) => {
        if (ok || cancelled) return;
        // <base> zodat het logo en andere paden vanaf de site laden.
        const withBase = html.replace(/<head([^>]*)>/i, `<head$1><base href="${window.location.origin}/">`);
        blobUrl = URL.createObjectURL(new Blob([withBase], { type: "text/html;charset=utf-8" }));
        setReportHref(blobUrl);
      });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [result]);

  const initialized = React.useRef(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const pushCharlie = React.useCallback(async (text: string, delay = 650) => {
    setTyping(true);
    await wait(delay);
    setTyping(false);
    setMessages((m) => [...m, { id: nextId(), from: "charlie", text }]);
  }, []);

  // Seed the intro + first question the first time the chat is opened.
  React.useEffect(() => {
    if (!isOpen || initialized.current) return;
    initialized.current = true;
    (async () => {
      await pushCharlie(brand.charlie.intro, 350);
      await pushCharlie(CHARLIE_STEPS[0].prompt, 700);
    })();
  }, [isOpen, pushCharlie]);

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

  /** Is er met dit adres al een scan gedaan, of: mail dat rapport opnieuw. */
  async function priorRequest(email: string, action: "check" | "resend"): Promise<{ known: boolean; sent?: boolean }> {
    try {
      const res = await fetch("/api/geo/prior", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action }),
      });
      if (!res.ok) return { known: false };
      return await res.json();
    } catch {
      return { known: false };
    }
  }

  /** Vraagt een echt antwoord op. Null: gebruik het vaste antwoord. */
  async function askCharlie(
    key: string,
    answer: string,
  ): Promise<{ reply: string; value: string | null; done: boolean } | null> {
    try {
      const res = await fetch("/api/geo/charlie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: key,
          answer: answer.slice(0, 600),
          pending,
          lastReply: lastReply ? lastReply.slice(0, 1000) : null,
          context: {
            company_name: answers.company_name,
            homepage_url: answers.homepage_url,
            offer_description: answers.offer_description,
            target_audience: answers.target_audience,
            desired_queries: answers.desired_queries,
          },
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return typeof data?.reply === "string" && data.reply ? data : null;
    } catch {
      return null;
    }
  }

  async function handleSend() {
    if (phase !== "asking" || typing) return;
    const step = CHARLIE_STEPS[stepIndex];
    const typed = input.trim();
    const validate = (v: string) => (step.validate ? step.validate(v) : null);

    if (!typed && !step.optional && !pending) {
      setInputError("Vul dit even in om verder te gaan.");
      return;
    }

    // Een geldig e-mailadres of een geldige URL is een antwoord, ook met een
    // vraagteken erin. Anders: reageer echt als de bezoeker iets vraagt, of als
    // Charlie bij deze stap al een vraag terug stelde.
    const say = (text: string) => setMessages((m) => [...m, { id: nextId(), from: "charlie", text }]);
    const echo = (text: string) => setMessages((m) => [...m, { id: nextId(), from: "user", text }]);

    // Een e-mailadres bij een latere vraag is een verbetering van het adres.
    if (step.key !== "email" && answers.email && typed && !/\s/.test(typed) && !fieldValidators.email(typed)) {
      setInputError(null);
      setInput("");
      echo(typed);
      setTyping(true);
      const prior = await priorRequest(typed, "check");
      setTyping(false);
      if (prior.known) {
        say(CHARLIE_COPY.priorCorrection);
      } else {
        setAnswers((a) => ({ ...a, email: typed }));
        say(`Aangepast. Ik stuur je rapport naar ${typed}.`);
      }
      await pushCharlie(step.prompt, 500);
      return;
    }

    if (step.key === "email" && typed) {
      /** Neemt het adres aan, tenzij er al een scan mee is gedaan. */
      const acceptEmail = async (email: string) => {
        setTyping(true);
        const prior = await priorRequest(email, "check");
        setTyping(false);
        if (prior.known) {
          setPriorEmail(email);
          say(CHARLIE_COPY.priorKnown);
          return;
        }
        setPriorEmail(null);
        setAnswers((a) => ({ ...a, email }));
        if (step.ack) say(step.ack(email));
        await advance();
      };

      // Antwoord op "Zal ik het rapport opnieuw mailen?"
      if (priorEmail && !emailCheck) {
        const yes = /^(ja|j|yes|graag|doe maar|stuur)\b/i.test(typed);
        const no = /^(nee|n|no|niet)\b/i.test(typed);
        if (yes) {
          setInputError(null);
          setInput("");
          echo(typed);
          setTyping(true);
          const res = await priorRequest(priorEmail, "resend");
          setTyping(false);
          say(res.sent ? CHARLIE_COPY.priorResent(priorEmail) : CHARLIE_COPY.priorResendFailed);
          await pushCharlie(brand.cta.chatLine, 500);
          setPhase("closed");
          return;
        }
        if (no) {
          setInputError(null);
          setInput("");
          echo(typed);
          say(CHARLIE_COPY.priorDeclined);
          await pushCharlie(brand.cta.chatLine, 500);
          return;
        }
        if (fieldValidators.email(typed)) {
          setInputError("Typ ja, nee of een ander e-mailadres.");
          return;
        }
        // Een ander adres: ga hieronder verder als nieuwe invoer.
      }

      // Antwoord op "Bedoel je ...?"
      if (emailCheck) {
        const yes = /^(ja|j|yes|klopt|inderdaad|dat bedoel ik)\b/i.test(typed);
        const no = /^(nee|n|no|niet)\b/i.test(typed);
        const chosen = yes ? emailCheck.suggestion : no ? emailCheck.original : typed;
        if (fieldValidators.email(chosen)) {
          setInputError("Typ ja, nee of je e-mailadres.");
          return;
        }
        setInputError(null);
        setInput("");
        echo(typed);
        setEmailCheck(null);
        await acceptEmail(chosen);
        return;
      }

      // Nieuwe invoer: vraag door bij een waarschijnlijke tikfout.
      if (!fieldValidators.email(typed)) {
        setInputError(null);
        setInput("");
        echo(typed);
        const suggestion = suggestEmailFix(typed);
        if (suggestion) {
          setEmailCheck({ original: typed, suggestion });
          say(`Bedoel je ${suggestion}? Typ ja of nee, of typ je adres opnieuw.`);
          return;
        }
        await acceptEmail(typed);
        return;
      }
    }

    // "sla over" bij een optionele vraag is geen inhoud en geen vraag aan Charlie.
    const skipWord = /^(sla\b.*over|overslaan|skip|nee|geen|n\.?v\.?t\.?|weet ik niet|geen idee)\b[\s.!]*$/i.test(typed);
    if (step.optional && skipWord && !pending) {
      setInputError(null);
      setInput("");
      setMessages((m) => [...m, { id: nextId(), from: "user", text: typed }]);
      setPending(null);
      setLastReply(null);
      setFollowUps(0);
      setAnswers((a) => ({ ...a, [step.key]: null }));
      await advance();
      return;
    }

    const plainValid =
      !!typed && (step.inputType === "email" || step.inputType === "url") && !validate(typed);
    const wantsReply =
      !!typed && !plainValid && followUps < MAX_FOLLOW_UPS && (pending !== null || followUps > 0 || needsCharlieReply(typed));

    let value = typed;
    let ack: string | null = null;

    if (wantsReply) {
      setInputError(null);
      setInput("");
      setMessages((m) => [...m, { id: nextId(), from: "user", text: typed }]);
      setTyping(true);
      const ai = await askCharlie(step.key, typed);
      setTyping(false);

      if (ai) {
        const candidate = ai.value ?? pending;
        // Een optionele vraag mag zonder antwoord klaar zijn.
        const candidateOk = candidate ? !validate(candidate) : Boolean(step.optional);
        if (!ai.done || !candidateOk) {
          // Charlie wacht op een reactie. De stap blijft open.
          setMessages((m) => [...m, { id: nextId(), from: "charlie", text: ai.reply }]);
          if (candidateOk) setPending(candidate);
          setLastReply(ai.reply);
          setFollowUps((n) => n + 1);
          return;
        }
        value = candidate ?? "";
        ack = ai.reply;
      } else {
        // Geen antwoord gekregen: ga verder met wat er staat.
        // Een losse vraag is geen antwoord. Bij een optionele stap blijft het veld dan leeg.
        const onlyQuestion = step.optional && !pending && needsCharlieReply(typed);
        value = onlyQuestion ? "" : pending ? `${pending}, ${typed}` : typed;
        const err = value ? validate(value) : null;
        if (err) {
          setInputError(err);
          return;
        }
      }
    } else {
      // Na het maximum aan vervolgvragen: een kort "nee" of "verder" telt niet als inhoud.
      const filler = /^(nee|ja|ok|oké|prima|verder|goed|top)\b[\s.!]*$/i.test(typed);
      if (pending && (!typed || filler)) value = pending;
      else if (typed && pending) value = `${pending}, ${typed}`;
      if (value) {
        const err = validate(value);
        if (err) {
          setInputError(err);
          return;
        }
      }
      setInputError(null);
      setInput("");
      setMessages((m) => [...m, { id: nextId(), from: "user", text: typed || (pending ? "verder" : "overgeslagen") }]);
    }

    setPending(null);
    setLastReply(null);
    setFollowUps(0);
    setAnswers((a) => ({ ...a, [step.key]: value || null }));

    if (ack) {
      setMessages((m) => [...m, { id: nextId(), from: "charlie", text: ack as string }]);
    } else if (step.ack && value) {
      await pushCharlie(step.ack(value), 500);
    }

    await advance();
  }

  /** Naar de volgende vraag, of naar de bevestiging na de laatste vraag. */
  async function advance() {
    const next = stepIndex + 1;
    setStepIndex(next);
    if (next < CHARLIE_STEPS.length) {
      await pushCharlie(CHARLIE_STEPS[next].prompt, 650);
    } else {
      setPhase("consent");
      await pushCharlie(CHARLIE_COPY.reviewLead, 600);
    }
  }

  async function startScan() {
    if (!consent) return;
    setPhase("scanning");
    setProcessingIndex(0);
    setScanProgress(0);
    await pushCharlie(CHARLIE_COPY.scanningLead, 300);

    const stepCount = CHARLIE_PROCESSING_STEPS.length;

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
        await pushCharlie(final?.message ?? CHARLIE_COPY.errorFallback, 500);
        return;
      }

      const data = final.data;
      setResult(data);
      setPhase("success");
      // Surface the server's user-safe message when present (account-level gate,
      // degraded run); otherwise the standard "scan is klaar" copy.
      await pushCharlie(data.message ?? CHARLIE_COPY.successLead, 500);
      if (!data.blocked) {
        if (data.email_queued) {
          await pushCharlie(CHARLIE_COPY.emailNote(payload.email), 500);
        }
        await pushCharlie(brand.cta.chatLine, 600);
      }
    } catch {
      stop();
      setPhase("error");
      await pushCharlie(CHARLIE_COPY.errorFallback, 400);
    }
  }

  function retry() {
    setPhase("consent");
    setInputError(null);
  }

  if (!isOpen) return null;

  const step = CHARLIE_STEPS[stepIndex];
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
      aria-label={`Chat met Charlie, ${brand.charlie.role}`}
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-lift animate-fade-up sm:h-[640px] sm:max-w-md sm:rounded-3xl">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-3">
            <CharlieAvatar size="md" withStatus />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-ink">{CHARLIE.name}</div>
              <div className="text-xs text-muted">
                {phase === "scanning" ? CHARLIE_COPY.scanningStatus : brand.charlie.role}
              </div>
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
        {phase !== "success" && phase !== "error" && phase !== "closed" ? (
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
              waiting={followUps > 0}
              onChange={(v) => {
                setInput(v);
                if (inputError) setInputError(null);
              }}
              onSend={handleSend}
            />
          )}

          {/* Er is al een scan gedaan met dit adres: bied ook de demo aan. */}
          {phase === "asking" && priorEmail && (
            <a
              href={STRATEGY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="geo-btn-primary mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-brand-fg shadow-soft transition-all hover:shadow-glow"
            >
              {brand.cta.label} <ArrowRightIcon className="h-4 w-4" />
            </a>
          )}

          {phase === "consent" && (
            <ConsentInput
              consent={consent}
              onToggle={() => setConsent((c) => !c)}
              onStart={startScan}
            />
          )}

          {phase === "scanning" && (
            <div className="flex items-center justify-center gap-2.5 px-1 py-2" role="status" aria-live="polite">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
              </span>
              <p className="text-sm text-ink">
                <span className="font-semibold">{CHARLIE_COPY.scanningStatus}</span>{" "}
                <span className="text-muted">{CHARLIE_COPY.scanningSubtle}</span>
              </p>
            </div>
          )}

          {phase === "success" && reportHref && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <a
                href={reportHref}
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
                {brand.cta.label} <ArrowRightIcon className="h-4 w-4" />
              </a>
            </div>
          )}

          {(phase === "error" || phase === "closed") && (
            <a
              href={STRATEGY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-brand/40 hover:text-brand"
            >
              {brand.cta.errorLabel} <ArrowRightIcon className="h-4 w-4" />
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
    step: (typeof CHARLIE_STEPS)[number];
    value: string;
    error: string | null;
    /** Charlie wacht op een reactie bij deze stap. */
    waiting?: boolean;
    disabled: boolean;
    onChange: (v: string) => void;
    onSend: () => void;
  }
>(function AskingInput({ step, value, error, disabled, waiting, onChange, onSend }, ref) {
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
          {waiting
            ? "Typ je reactie, of druk op Enter om verder te gaan"
            : step.optional
              ? "Optioneel, druk op Enter om over te slaan"
              : "Druk op Enter om te versturen"}
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
  const consentLabel = useBrand().consentLabel;
  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand"
        />
        <span>{consentLabel}</span>
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
  const activeStep = CHARLIE_PROCESSING_STEPS[Math.min(activeIndex, CHARLIE_PROCESSING_STEPS.length - 1)];
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
        {CHARLIE_PROCESSING_STEPS.map((step, i) => {
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
  const unscored = Boolean(p.unscored_reason);
  const tone = unscored
    ? "text-subtle"
    : score >= 70 ? "text-success" : score >= 45 ? "text-warning" : "text-danger";
  return (
    <div className="animate-fade-up space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className={cn("font-display text-4xl font-bold leading-none", tone)}>
            {unscored ? "–" : score}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-subtle">/ 100</div>
        </div>
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand">
            {unscored ? "Geen score" : "Paginascore"}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-accent"
              style={{ width: `${unscored ? 0 : score}%` }}
            />
          </div>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-muted">{p.short_summary}</p>
      {unscored ? (
        <p className="text-xs leading-relaxed text-subtle">{p.unscored_reason}</p>
      ) : null}
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

import type { SpeedFailureReason, SpeedMeasurement } from "../speed";
import type { CheckDefinition, CheckResult } from "./types";

/** LCP up to this many ms is pass. */
export const LCP_PASS_MAX_MS = 2_000;
/** LCP up to this many ms is attention; slower is fail. */
export const LCP_ATTENTION_MAX_MS = 4_000;

const FAILURE_TEXT: Record<Exclude<SpeedFailureReason, "page_not_measurable">, string> = {
  timeout: "the measurement took too long",
  quota: "the PageSpeed Insights quota was exhausted",
  http_error: "PageSpeed Insights returned an error",
  invalid_response: "PageSpeed Insights returned an unreadable result",
  network: "PageSpeed Insights could not be reached",
};

/** The n/a summaries: the page itself is not in doubt, it simply was not measured. */
const NOT_MEASURED_TEXT: Record<"quota" | "timeout", string> = {
  quota: "Page speed was not measured: the PageSpeed Insights quota was exhausted (a PAGESPEED_API_KEY raises it).",
  timeout: "Page speed was not measured: the measurement took too long.",
};

const EMPTY_FACTS = { lcp_ms: null, fcp_ms: null, performance_score: null, strategy: "mobile" } as const;

type Measured = Extract<SpeedMeasurement, { ok: true }>;
type Failed = Extract<SpeedMeasurement, { ok: false }>;

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function statusOf(lcpMs: number): CheckResult["status"] {
  return lcpMs <= LCP_PASS_MAX_MS ? "pass" : lcpMs <= LCP_ATTENTION_MAX_MS ? "attention" : "fail";
}

function failureSummary(speed: Failed): string {
  if (speed.reason === "page_not_measurable") {
    const error = speed.lighthouse_error;
    const code = error ? ` (${error.code})` : "";
    const message = error?.message ? `: ${error.message.replace(/\.$/, "")}` : "";
    return `Page speed could not be measured: Lighthouse could not load the page${code}${message}.`;
  }
  return `Page speed could not be measured: ${FAILURE_TEXT[speed.reason]}.`;
}

function failed(speed: Failed): CheckResult {
  const notMeasured = speed.reason === "quota" || speed.reason === "timeout";
  return {
    id: "speed",
    status: notMeasured ? "n/a" : "unknown",
    summary: notMeasured ? NOT_MEASURED_TEXT[speed.reason as "quota" | "timeout"] : failureSummary(speed),
    facts: {
      ...EMPTY_FACTS,
      failure_reason: speed.reason,
      ...(speed.lighthouse_error ? { lighthouse_error: speed.lighthouse_error.code } : {}),
    },
    evidence: null,
  };
}

/** "LCP 2.3 s, FCP 1.1 s, score 85" for a lab run, leaving out what PSI did not report. */
function labText(lab: NonNullable<Measured["lab"]>): string {
  const parts = [`LCP ${seconds(lab.lcp_ms)}`];
  if (lab.fcp_ms !== null) parts.push(`FCP ${seconds(lab.fcp_ms)}`);
  if (lab.performance_score !== null) parts.push(`score ${lab.performance_score}`);
  return parts.join(", ");
}

function facts(speed: Measured): CheckResult["facts"] {
  return {
    lcp_ms: speed.lcp_ms,
    fcp_ms: speed.fcp_ms,
    performance_score: speed.performance_score,
    strategy: "mobile",
    source: speed.source,
    field_lcp_p75_ms: speed.field?.p75_ms ?? null,
    field_category: speed.field?.category ?? null,
    field_scope: speed.field?.scope ?? null,
    lab_lcp_ms: speed.lab?.lcp_ms ?? null,
    runs: speed.runs,
    ...(speed.lab_error ? { lab_error: speed.lab_error.code } : {}),
  };
}

function fieldResult(speed: Measured, field: NonNullable<Measured["field"]>): CheckResult {
  const where = field.scope === "page" ? "this page" : "the whole site";
  const rated = field.category ? `, rated ${field.category}` : "";
  const lab = speed.lab
    ? ` One lab run: ${labText(speed.lab)}.`
    : speed.lab_error
      ? ` The lab run failed: Lighthouse could not load the page (${speed.lab_error.code}).`
      : "";
  return {
    id: "speed",
    status: statusOf(speed.lcp_ms),
    summary: `Real-user LCP (75th percentile, last 28 days, mobile, ${where}): ${speed.lcp_ms} ms${rated}.${lab}`,
    facts: facts(speed),
    evidence: `LCP p75 ${seconds(field.p75_ms)} (real users, ${where}${field.category ? `, ${field.category}` : ""})${
      speed.lab ? `; lab ${labText(speed.lab)}` : ""
    }`,
  };
}

/** "LCP 1800 ms, FCP 1100 ms, performance score 92", the summary wording of a lab run. */
function labSummaryText(lab: NonNullable<Measured["lab"]>): string {
  const parts = [`LCP ${lab.lcp_ms} ms`];
  if (lab.fcp_ms !== null) parts.push(`FCP ${lab.fcp_ms} ms`);
  if (lab.performance_score !== null) parts.push(`performance score ${lab.performance_score}`);
  return parts.join(", ");
}

function labResult(speed: Measured, lab: NonNullable<Measured["lab"]>): CheckResult {
  const lower = speed.runs === 2 ? " (lower of two runs)" : "";
  return {
    id: "speed",
    status: statusOf(speed.lcp_ms),
    summary:
      `Mobile lab measurement${lower}: ${labSummaryText(lab)}. ` +
      "No real-user data for this page or site; a lab measurement can vary per run.",
    facts: facts(speed),
    evidence: `${labText(lab)} (mobile, lab${speed.runs === 2 ? ", lower of 2 runs" : ""})`,
  };
}

/**
 * Page speed from an already taken PageSpeed Insights measurement (mobile) on
 * the context; this check never measures anything itself. Grades the
 * real-user LCP (75th percentile, 28 days) when PSI has it, else one lab run.
 * Pass when LCP ≤ 2000 ms, attention ≤ 4000 ms, fail above. Unknown when the
 * measurement failed (the summary names why, including Lighthouse's own error
 * when it could not load the page), except an exhausted PageSpeed Insights
 * quota or a measurement that took too long (its own SPEED_TIMEOUT_MS, or
 * still running at the request's time budget), which are n/a: nothing about
 * the page is in doubt, it simply was not measured. Also n/a when there is no
 * measurement because speed was not requested or the page was not fetched.
 */
export const speedCheck: CheckDefinition = {
  id: "speed",
  label: "Page speed",
  run({ speed }): CheckResult {
    if (!speed) {
      return { id: "speed", status: "n/a", summary: "Page speed was not measured for this page.", facts: {}, evidence: null };
    }
    if (!speed.ok) return failed(speed);
    if (speed.source === "field" && speed.field) return fieldResult(speed, speed.field);
    if (speed.lab) return labResult(speed, speed.lab);
    return failed({ ok: false, reason: "invalid_response" });
  },
};

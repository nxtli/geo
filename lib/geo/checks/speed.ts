import type { SpeedFailureReason } from "../speed";
import type { CheckDefinition, CheckResult } from "./types";

/** LCP up to this many ms is pass. */
export const LCP_PASS_MAX_MS = 2_000;
/** LCP up to this many ms is attention; slower is fail. */
export const LCP_ATTENTION_MAX_MS = 4_000;

const FAILURE_TEXT: Record<SpeedFailureReason, string> = {
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

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Page speed from an already taken PageSpeed Insights measurement (mobile,
 * lab) on the context; this check never measures anything itself. Pass when
 * LCP ≤ 2000 ms, attention ≤ 4000 ms, fail above. Unknown when the
 * measurement failed (the summary names why), except an exhausted
 * PageSpeed Insights quota or a measurement that took too long (its own
 * SPEED_TIMEOUT_MS, or still running at the request's time budget), which
 * are n/a: nothing about the page is in doubt, it simply was not measured.
 * Also n/a when there is no measurement because speed was not requested or
 * the page was not fetched.
 */
export const speedCheck: CheckDefinition = {
  id: "speed",
  label: "Page speed",
  run({ speed }): CheckResult {
    if (!speed) {
      return { id: "speed", status: "n/a", summary: "Page speed was not measured for this page.", facts: {}, evidence: null };
    }
    if (!speed.ok && (speed.reason === "quota" || speed.reason === "timeout")) {
      return {
        id: "speed",
        status: "n/a",
        summary: NOT_MEASURED_TEXT[speed.reason],
        facts: { lcp_ms: null, fcp_ms: null, performance_score: null, strategy: "mobile", failure_reason: speed.reason },
        evidence: null,
      };
    }
    if (!speed.ok) {
      return {
        id: "speed",
        status: "unknown",
        summary: `Page speed could not be measured: ${FAILURE_TEXT[speed.reason]}.`,
        facts: { lcp_ms: null, fcp_ms: null, performance_score: null, strategy: "mobile", failure_reason: speed.reason },
        evidence: null,
      };
    }
    const { lcp_ms, fcp_ms, performance_score } = speed;
    return {
      id: "speed",
      status: lcp_ms <= LCP_PASS_MAX_MS ? "pass" : lcp_ms <= LCP_ATTENTION_MAX_MS ? "attention" : "fail",
      summary: `Mobile lab measurement: LCP ${lcp_ms} ms, FCP ${fcp_ms} ms, performance score ${performance_score}.`,
      facts: { lcp_ms, fcp_ms, performance_score, strategy: "mobile" },
      evidence: `LCP ${seconds(lcp_ms)}, FCP ${seconds(fcp_ms)}, score ${performance_score} (mobile, lab)`,
    };
  },
};

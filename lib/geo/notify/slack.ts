import type { GeoAnalysisResult, GeoLeadInput } from "../types";
import { logError, logInfo } from "../logger";

/**
 * Slack notification adapter — posts to a Slack Incoming Webhook when a GEO
 * scan is submitted, so the team gets pinged on every new lead.
 *
 * Configure SLACK_WEBHOOK_URL (server-side only). Without it this is a no-op,
 * so the scan flow never depends on Slack being set up.
 *
 * Create the webhook: Slack → Apps → "Incoming Webhooks" → Add to a channel →
 * copy the https://hooks.slack.com/services/... URL into SLACK_WEBHOOK_URL.
 */
export interface SlackNotifyParams {
  lead: GeoLeadInput;
  status: "completed" | "failed";
  analysis?: GeoAnalysisResult | null;
  /** Absolute URL to the report. */
  reportUrl?: string | null;
  /** True when the real engine failed and we fell back to the mock. */
  degraded?: boolean;
  /** Which analysis engine produced this (geo-skill | claude | mock). */
  providerId?: string;
}

export async function notifySlackNewLead(
  params: SlackNotifyParams,
): Promise<{ sent: boolean }> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    logInfo("slack", "SLACK_WEBHOOK_URL not set — skipping notification");
    return { sent: false };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildMessage(params)),
    });
    if (!res.ok) {
      logError("slack.notify", `slack responded ${res.status}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (error) {
    logError("slack.notify", error);
    return { sent: false };
  }
}

function buildMessage(p: SlackNotifyParams) {
  const { lead, analysis, reportUrl, status } = p;
  const score = analysis?.visibility_score;

  const headline =
    status === "failed"
      ? ":warning: Nieuwe GEO Scan aanvraag (scan mislukt — handmatig opvolgen)"
      : ":mag: Nieuwe GEO Scan aanvraag";

  const engineNote =
    status === "completed" && (p.degraded || p.providerId === "mock")
      ? " · _voorlopige analyse (mock) — skill nog niet actief_"
      : "";

  const fields = [
    field("Naam", lead.name),
    field("E-mail", lead.email),
    field("Telefoon", lead.phone),
    field("Functie", lead.job_title),
    field("Bedrijf", lead.company_name),
    field("Homepage", `<${lead.homepage_url}|${lead.homepage_url}>`),
  ];
  if (typeof score === "number") {
    fields.push(field("AI Visibility Score", `*${score}/100*`));
  }

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: status === "failed" ? "⚠️ GEO Scan aanvraag" : "🔎 GEO Scan aanvraag", emoji: true },
    },
    { type: "section", text: { type: "mrkdwn", text: `${headline}${engineNote}` } },
    { type: "section", fields },
  ];

  const detail = [
    lead.target_audience && `*Doelgroep:* ${truncate(lead.target_audience, 300)}`,
    lead.desired_queries && `*Gewenste AI-vragen:* ${truncate(lead.desired_queries, 300)}`,
    analysis?.short_summary && `*Samenvatting:* ${truncate(analysis.short_summary, 400)}`,
  ]
    .filter(Boolean)
    .join("\n");
  if (detail) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: detail } });
  }

  if (reportUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Bekijk rapport", emoji: true },
          url: reportUrl,
          style: "primary",
        },
      ],
    });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "Bron: geo.nxtli.com" }],
  });

  // `text` is the notification fallback (shown in push/preview).
  return {
    text: `${status === "failed" ? "⚠️ " : "🔎 "}Nieuwe GEO Scan: ${lead.company_name} (${lead.email})`,
    blocks,
  };
}

function field(label: string, value: string) {
  return { type: "mrkdwn", text: `*${label}:*\n${value}` };
}

function truncate(s: string, n: number): string {
  const t = (s || "").trim();
  return t.length > n ? `${t.slice(0, n).trim()}…` : t;
}

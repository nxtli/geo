import type { GeoAnalysisResult } from "../types";
import { logError, logInfo } from "../logger";

/**
 * Email adapter for the GEO report.
 *
 * Default implementation: Resend HTTP API (no extra dependency — uses fetch).
 * Configure RESEND_API_KEY + GEO_EMAIL_FROM to enable. When not configured the
 * adapter logs and reports `sent: false` so the API can tell the visitor the
 * report will be sent — the flow never breaks on a missing mailer.
 *
 * To use a different provider (Postmark, SES, SMTP, an internal NXTLI mailer),
 * replace the body of `deliver()` — the public `sendGeoReportEmail` contract
 * stays the same.
 */

export interface SendReportParams {
  to: string;
  name: string;
  companyName: string;
  analysis: GeoAnalysisResult;
  reportHtml: string;
  reportUrl?: string | null;
}

export interface SendResult {
  sent: boolean;
}

export async function sendGeoReportEmail(
  params: SendReportParams,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.GEO_EMAIL_FROM;

  if (!apiKey || !from) {
    logInfo("email", "mailer not configured — report email prepared, not sent");
    return { sent: false };
  }

  const subject = "Je NXTLI GEO Scan is klaar";
  const html = renderEmailHtml(params);
  const text = renderEmailText(params);

  try {
    return await deliver({ apiKey, from, to: params.to, subject, html, text });
  } catch (error) {
    logError("email.send", error);
    return { sent: false };
  }
}

async function deliver(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    logError("email.send", `resend responded ${res.status}`);
    return { sent: false };
  }
  return { sent: true };
}

function strategyUrl(): string {
  return process.env.GEO_STRATEGY_CALL_URL || "https://nxtli.com";
}

function renderEmailText(p: SendReportParams): string {
  const link = p.reportUrl ?? strategyUrl();
  return `Hoi ${p.name},

Brian heeft je homepage geanalyseerd op AI-vindbaarheid.

Je AI Visibility Score: ${p.analysis.visibility_score}/100

Je vindt je volledige rapport via deze link:
${link}

In het rapport zie je hoe duidelijk jouw website is voor AI-systemen zoals ChatGPT en Claude, welke kansen er liggen en welke verbeteringen je als eerste kunt oppakken.

Wil je dat we met je meekijken? Plan hier een korte strategiesessie:
${strategyUrl()}

Groet,
NXTLI`;
}

function renderEmailHtml(p: SendReportParams): string {
  const link = p.reportUrl ?? strategyUrl();
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f6f7fa;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#5850ec">NXTLI GEO Scan</div>
    <h1 style="font-size:22px;margin:8px 0 16px">Je rapport is klaar, ${escapeHtml(p.name)}</h1>
    <p style="color:#475569;line-height:1.6">Brian heeft je homepage van <strong>${escapeHtml(p.companyName)}</strong> geanalyseerd op AI-vindbaarheid.</p>
    <div style="border:1px solid #e4e7ed;border-radius:14px;padding:18px;margin:16px 0;background:#fff">
      <div style="font-size:13px;color:#475569">AI Visibility Score</div>
      <div style="font-size:40px;font-weight:800;color:#5850ec">${p.analysis.visibility_score}<span style="font-size:16px;color:#94a3b8">/100</span></div>
      <p style="color:#475569;margin:8px 0 0;line-height:1.6">${escapeHtml(p.analysis.short_summary)}</p>
    </div>
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#5850ec;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Bekijk je volledige rapport</a>
    <p style="color:#475569;line-height:1.6;margin-top:24px">Wil je dat we met je meekijken? <a href="${escapeHtml(strategyUrl())}" style="color:#5850ec">Plan een korte GEO-strategiesessie</a>.</p>
    <p style="color:#94a3b8;font-size:12px;margin-top:28px">Groet,<br/>NXTLI</p>
  </div></body></html>`;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

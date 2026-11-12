import type { GeoAnalysisResult } from "../types";
import { logError, logInfo } from "../logger";
import { BRANDS, type Brand } from "../brand";

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
  /** De gescande pagina, voor in de tekst. */
  pageUrl?: string | null;
  brand?: Brand;
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

  const brand = params.brand ?? BRANDS.nxtli;
  const subject = brand.email.subject;
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

function strategyUrl(brand: Brand): string {
  return brand.id === "nxtli"
    ? process.env.GEO_STRATEGY_CALL_URL || brand.cta.url
    : brand.cta.url;
}

/** Voornaam voor de aanhef. */
function firstName(name: string): string {
  return (name || "").trim().split(/\s+/)[0] || "daar";
}

/** Maakt van een pad een volledig adres. Mailprogramma's kennen de site niet. */
function absolute(url: string, brand: Brand): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${brand.siteUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}

/** Leesbare naam van de gescande pagina: domein plus pad, zonder protocol. */
function pageLabel(url?: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return (u.host.replace(/^www\./, "") + u.pathname).replace(/\/$/, "");
  } catch {
    return url;
  }
}

/** De eerste adviezen uit het rapport, voor in de mail. */
function topActions(analysis: GeoAnalysisResult): Array<{ title: string; why: string }> {
  return (analysis.actions ?? [])
    .filter((a) => a?.title)
    .slice(0, 3)
    .map((a) => ({ title: a.title, why: a.why ?? "" }));
}

function scoreLine(analysis: GeoAnalysisResult): { value: string; note: string } {
  if (analysis.unscored_reason) {
    return { value: "Geen score", note: analysis.unscored_reason };
  }
  if (analysis.blocked) {
    return {
      value: `${analysis.visibility_score}/100`,
      note: "Een AI-tool kan of mag deze pagina niet gebruiken. Daarom is de score afgetopt. Los eerst de blokkade op.",
    };
  }
  return { value: `${analysis.visibility_score}/100`, note: analysis.short_summary ?? "" };
}

export function renderEmailText(p: SendReportParams): string {
  const brand = p.brand ?? BRANDS.nxtli;
  const link = p.reportUrl ? absolute(p.reportUrl, brand) : strategyUrl(brand);
  const page = pageLabel(p.pageUrl);
  const score = scoreLine(p.analysis);
  const actions = topActions(p.analysis);
  const lines = [
    `Hoi ${firstName(p.name)},`,
    "",
    `Charlie heeft je pagina${page ? ` ${page}` : ""} beoordeeld op geschiktheid voor AI-zoekmachines.`,
    "",
    `Paginascore: ${score.value}`,
    score.note,
  ];
  if (actions.length) {
    lines.push("", "Hier begin je mee:");
    actions.forEach((a, i) => lines.push(`${i + 1}. ${a.title}`));
  }
  lines.push(
    "",
    "Je volledige rapport, met per advies wat je aanpast en waarom:",
    link,
    "",
    `${brand.email.ctaLine}:`,
    strategyUrl(brand),
    "",
    "Groet,",
    brand.email.signoff,
  );
  return lines.join("\n");
}

export function renderEmailHtml(p: SendReportParams): string {
  const brand = p.brand ?? BRANDS.nxtli;
  const c = brand.email.color;
  const link = p.reportUrl ? absolute(p.reportUrl, brand) : strategyUrl(brand);
  const page = pageLabel(p.pageUrl);
  const score = scoreLine(p.analysis);
  const unscored = Boolean(p.analysis.unscored_reason);
  const actions = topActions(p.analysis);
  const logo = absolute(brand.logo.src, brand);
  // Outlook toont geen webp. Het portret staat er alleen in als jpg of png.
  const avatar = /\.(jpe?g|png)$/i.test(brand.charlie.avatar) ? absolute(brand.charlie.avatar, brand) : null;

  const scoreHtml = unscored
    ? `<div style="font-size:24px;font-weight:800;color:#0f172a">Geen score</div>`
    : `<div style="font-size:40px;font-weight:800;color:${c}">${p.analysis.visibility_score}<span style="font-size:16px;color:#94a3b8">/100</span></div>`;

  const actionsHtml = actions.length
    ? `<h2 style="font-size:16px;margin:24px 0 8px">Hier begin je mee</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      ${actions
        .map(
          (a, i) => `<tr>
        <td valign="top" style="width:28px;padding:8px 0;font-weight:800;color:${c}">${i + 1}.</td>
        <td style="padding:8px 0;line-height:1.5"><strong>${escapeHtml(a.title)}</strong>${a.why ? `<br/><span style="color:#475569">${escapeHtml(a.why)}</span>` : ""}</td>
      </tr>`,
        )
        .join("")}
    </table>`
    : "";

  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f6f7fa;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <img src="${escapeHtml(logo)}" alt="${escapeHtml(brand.logo.alt)}" height="28" style="height:28px;width:auto;display:block;border:0;margin-bottom:20px"/>
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:${c}">${escapeHtml(brand.id === "mat" ? "Marketing AI Team · GEO-scan" : brand.product)}</div>
    <h1 style="font-size:22px;margin:8px 0 16px">Je rapport is klaar, ${escapeHtml(firstName(p.name))}</h1>
    <p style="color:#475569;line-height:1.6">Charlie heeft je pagina${page ? ` <strong>${escapeHtml(page)}</strong>` : ""} beoordeeld op geschiktheid voor AI-zoekmachines.</p>
    <div style="border:1px solid #e4e7ed;border-radius:14px;padding:18px;margin:16px 0;background:#fff">
      <div style="font-size:13px;color:#475569">Paginascore</div>
      ${scoreHtml}
      ${score.note ? `<p style="color:#475569;margin:8px 0 0;line-height:1.6">${escapeHtml(score.note)}</p>` : ""}
    </div>
    ${actionsHtml}
    <p style="color:#475569;line-height:1.6;margin:20px 0 14px">In het rapport staat per advies wat je aanpast, waar op de pagina en waarom.</p>
    <a href="${escapeHtml(link)}" style="display:inline-block;background:${c};color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Bekijk je volledige rapport</a>
    <p style="color:#64748b;font-size:13px;line-height:1.5;margin:12px 0 0">Of open deze link: <a href="${escapeHtml(link)}" style="color:${c};word-break:break-all">${escapeHtml(link.replace(/^https?:\/\//, ""))}</a></p>
    <p style="color:#475569;line-height:1.6;margin-top:24px"><a href="${escapeHtml(strategyUrl(brand))}" style="color:${c}">${escapeHtml(brand.email.ctaLine)}</a>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px"><tr>
      ${avatar ? `<td style="padding-right:12px"><img src="${escapeHtml(avatar)}" alt="Charlie" width="44" height="44" style="width:44px;height:44px;border-radius:22px;display:block;border:0"/></td>` : ""}
      <td style="color:#64748b;font-size:13px;line-height:1.5">Groet,<br/>${escapeHtml(brand.email.signoff)}</td>
    </tr></table>
  </div></body></html>`;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

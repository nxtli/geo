import { NextResponse } from "next/server";
import { geoLeadSchema } from "@/lib/geo/validation";
import type { GeoLeadInput, GeoScanResponse } from "@/lib/geo/types";
import { fetchHomepage } from "@/lib/geo/scrape";
import { runGeoAnalysis } from "@/lib/geo/analysis";
import { parseAnalysisResult } from "@/lib/geo/analysis/provider";
import { buildPreview, buildReportHtml } from "@/lib/geo/report/service";
import { generatePdf } from "@/lib/geo/report/pdf";
import { putReportHtml } from "@/lib/geo/report/store";
import { sendGeoReportEmail } from "@/lib/geo/email/service";
import { notifySlackNewLead } from "@/lib/geo/notify/slack";
import {
  countCompletedScansSince,
  createScanRequest,
  findCompletedScanByEmail,
  insertLead,
  insertReport,
  updateScanRequest,
} from "@/lib/geo/supabase/service";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/geo/scan
 *
 * Orchestrates the full GEO scan:
 *   validate → persist lead + scan request → fetch homepage → AI analysis →
 *   build report (HTML + optional PDF) → persist report → send email →
 *   respond with a chat preview + download link.
 *
 * All secrets stay server-side. User-facing messages never contain technical
 * detail; errors are logged server-side only.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let scanRequestId: string | null = null;
  let lead: GeoLeadInput | null = null;
  const baseUrl = resolveBaseUrl(request);

  try {
    const body = await request.json().catch(() => null);
    const parsed = geoLeadSchema.safeParse(body);

    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Controleer je gegevens even.";
      return NextResponse.json(
        { ok: false, status: "failed", message },
        { status: 400 },
      );
    }

    lead = {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      phone: parsed.data.phone,
      job_title: parsed.data.job_title,
      company_name: parsed.data.company_name,
      homepage_url: parsed.data.homepage_url,
      offer_description: parsed.data.offer_description,
      target_audience: parsed.data.target_audience,
      desired_queries: parsed.data.desired_queries,
      competitors: parsed.data.competitors ?? null,
      consent: parsed.data.consent,
    };

    // 0a. Abuse protection — one scan per email. Re-use the earlier report
    //     instead of spending credits on a repeat run.
    const prior = await findCompletedScanByEmail(lead.email);
    if (prior?.analysis_result) {
      const priorAnalysis = parseAnalysisResult(prior.analysis_result);
      const priorUrl = `/api/geo/report/${prior.id}`;
      await notifySlackNewLead({
        lead,
        status: "completed",
        analysis: priorAnalysis,
        reportUrl: baseUrl ? `${baseUrl}${priorUrl}` : priorUrl,
        repeat: true,
      });
      return NextResponse.json({
        ok: true,
        scan_request_id: prior.id,
        status: "completed",
        preview: buildPreview(priorAnalysis),
        report_url: priorUrl,
        email_queued: false,
        message:
          "Je hebt met dit e-mailadres al een gratis scan gedaan. Hier is je eerdere rapport — wil je een nieuwe analyse? Plan dan even een sessie met NXTLI.",
      });
    }

    // 0b. Optional global daily cap (GEO_MAX_SCANS_PER_DAY) — a credit backstop.
    const dailyCap = Number(process.env.GEO_MAX_SCANS_PER_DAY);
    if (Number.isFinite(dailyCap) && dailyCap > 0) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const used = await countCompletedScansSince(since);
      if (used >= dailyCap) {
        return NextResponse.json(
          {
            ok: false,
            status: "failed",
            message:
              "We hebben vandaag al heel veel scans gedraaid. Probeer het morgen opnieuw — of plan direct een korte sessie met NXTLI.",
          },
          { status: 429 },
        );
      }
    }

    // 1. Persist lead + scan request (no-ops gracefully if Supabase is off).
    const persistedLead = await insertLead(lead);
    const scan = await createScanRequest({
      leadId: persistedLead?.id ?? null,
      homepageUrl: lead.homepage_url,
      rawInput: lead,
    });
    scanRequestId = scan?.id ?? cryptoRandomId();

    if (scan) await updateScanRequest(scan.id, { status: "scanning" });

    // 2. Best-effort homepage fetch to feed the analysis.
    const page = await fetchHomepage(lead.homepage_url);

    // 3. Run the AI analysis (existing skill → Claude → mock fallback chain).
    const { result: analysis, degraded, providerId, usage } = await runGeoAnalysis({
      homepage_url: lead.homepage_url,
      company_name: lead.company_name,
      offer_description: lead.offer_description,
      target_audience: lead.target_audience,
      desired_queries: lead.desired_queries,
      competitors: lead.competitors,
      page_content: page.text,
      metadata: page.metadata,
      robots_txt: page.robotsTxt,
      llms_txt_present: page.llmsTxtPresent,
    });

    // 4. Build the branded report (HTML now; PDF via adapter when configured).
    const reportHtml = buildReportHtml({ lead, analysis });
    putReportHtml(scanRequestId, reportHtml);
    const { pdfUrl } = await generatePdf({ html: reportHtml, scanRequestId });

    const reportUrl = `/api/geo/report/${scanRequestId}`;

    // 5. Persist analysis + report.
    if (scan) {
      await insertReport({
        scanRequestId: scan.id,
        leadId: persistedLead?.id ?? null,
        analysis,
        reportHtml,
        pdfUrl,
      });
      await updateScanRequest(scan.id, {
        status: "completed",
        analysis_result: analysis,
        report_url: reportUrl,
        pdf_url: pdfUrl,
        visibility_score: analysis.visibility_score,
        model: usage?.model ?? null,
        input_tokens: usage?.input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
      });
    }

    // 6. Send (or prepare) the report email.
    const email = await sendGeoReportEmail({
      to: lead.email,
      name: lead.name,
      companyName: lead.company_name,
      analysis,
      reportHtml,
      reportUrl,
    });
    if (scan && email.sent) {
      await updateScanRequest(scan.id, { email_sent_at: new Date().toISOString() });
    }

    // 7. Notify the team in Slack (no-op if SLACK_WEBHOOK_URL is unset).
    await notifySlackNewLead({
      lead,
      status: "completed",
      analysis,
      reportUrl: baseUrl ? `${baseUrl}${reportUrl}` : reportUrl,
      degraded,
      providerId,
    });

    return NextResponse.json({
      ok: true,
      scan_request_id: scanRequestId,
      status: "completed",
      preview: buildPreview(analysis),
      report_url: reportUrl,
      email_queued: email.sent,
      message: degraded
        ? "Je rapport staat klaar. We kijken er ook handmatig naar voor de puntjes op de i."
        : undefined,
    });
  } catch (error) {
    logError("api.geo.scan", error);
    if (scanRequestId) {
      await updateScanRequest(scanRequestId, {
        status: "failed",
        error_message: error instanceof Error ? error.message : "unknown",
      }).catch(() => undefined);
    }
    // Still ping Slack so a failed scan gets manual follow-up (if we have a lead).
    if (lead) {
      await notifySlackNewLead({ lead, status: "failed" }).catch(() => undefined);
    }
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message:
          "Er ging iets mis met de automatische scan. We hebben je aanvraag wel ontvangen en kunnen je rapport handmatig nasturen.",
      },
      { status: 500 },
    );
  }
}

/** Absolute origin for building report links (used in Slack/email). */
function resolveBaseUrl(request: Request): string | null {
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.GEO_PUBLIC_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return host ? `${proto}://${host}` : null;
}

function cryptoRandomId(): string {
  // Stable enough for the ephemeral report link when Supabase is off.
  return `local-${globalThis.crypto?.randomUUID?.() ?? Math.abs(hash(String(Date.now())))}`;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

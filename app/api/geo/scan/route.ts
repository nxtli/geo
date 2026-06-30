import { geoLeadSchema, normalizePhone } from "@/lib/geo/validation";
import type { GeoLeadInput } from "@/lib/geo/types";
import { fetchHomepage } from "@/lib/geo/scrape";
import { runGeoAnalysis } from "@/lib/geo/analysis";
import { parseAnalysisResult } from "@/lib/geo/analysis/provider";
import { buildPreview, buildReportHtml } from "@/lib/geo/report/service";
import { generatePdf } from "@/lib/geo/report/pdf";
import { putReportHtml } from "@/lib/geo/report/store";
import { sendGeoReportEmail } from "@/lib/geo/email/service";
import { notifySlackNewLead } from "@/lib/geo/notify/slack";
import { ensureSchemaOnce } from "@/lib/geo/supabase/migrate";
import {
  countCompletedScansSince,
  createScanRequest,
  findCompletedScanByEmail,
  insertLead,
  insertReport,
  isSupabaseConfigured,
  updateScanRequest,
} from "@/lib/geo/supabase/service";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/geo/scan
 *
 * Streams newline-delimited JSON progress events tied to the REAL phases —
 * fetch → analyse (live token progress) → report — followed by a final
 * `result` (or `error`) event. The chat reads these to drive the loader so the
 * bar tracks what's actually happening instead of a time estimate.
 *
 * Events: {type:"progress", pct, step} | {type:"result", data} | {type:"error", message}
 *
 * All secrets stay server-side; user-facing messages never contain technical detail.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const parsed = geoLeadSchema.safeParse(body);
  const baseUrl = resolveBaseUrl(request);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
        } catch {
          /* controller already closed */
        }
      };
      const progress = (pct: number, step: number) =>
        send({ type: "progress", pct: Math.round(pct), step });
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      if (!parsed.success) {
        send({
          type: "error",
          message: parsed.error.issues[0]?.message ?? "Controleer je gegevens even.",
        });
        return close();
      }

      const lead: GeoLeadInput = {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        // Store the canonical 06xxxxxxxx form (validation already guaranteed it).
        phone: normalizePhone(parsed.data.phone) ?? parsed.data.phone,
        job_title: parsed.data.job_title,
        company_name: parsed.data.company_name,
        homepage_url: parsed.data.homepage_url,
        offer_description: parsed.data.offer_description,
        target_audience: parsed.data.target_audience,
        desired_queries: parsed.data.desired_queries,
        competitors: parsed.data.competitors ?? null,
        consent: parsed.data.consent,
      };

      let scanRequestId: string | null = null;

      try {
        await ensureSchemaOnce();
        progress(5, 0);

        // 0a. Account-level gate: one free scan per email address. If this email
        // already completed a scan (for ANY page), block this new scan and show
        // their earlier report instead of burning credits — and instead of
        // confusingly returning an unrelated page's result.
        let prior: Awaited<ReturnType<typeof findCompletedScanByEmail>> = null;
        try {
          prior = await findCompletedScanByEmail(lead.email);
        } catch (dedupError) {
          // DB is configured but the gate lookup failed — fail CLOSED so we
          // don't spend AI credits on a scan we couldn't verify as a first one.
          logError("api.geo.scan.dedup", dedupError);
          send({
            type: "error",
            message:
              "We konden je aanvraag op dit moment niet verifiëren. Probeer het over een paar minuten opnieuw.",
          });
          return close();
        }
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
          progress(100, 5);
          const priorHost = safeHost(prior.homepage_url);
          const differentPage =
            !!priorHost && safeHost(lead.homepage_url) !== priorHost;
          const message = differentPage
            ? `Je hebt met dit e-mailadres al een gratis GEO-scan gedaan${
                priorHost ? ` (voor ${priorHost})` : ""
              }. Per e-mailadres is er één gratis scan beschikbaar, dus deze nieuwe scan voeren we niet uit. Hieronder vind je je eerdere rapport. Wil je een andere pagina laten analyseren? Plan dan even een korte sessie met NXTLI.`
            : "Je hebt met dit e-mailadres al een gratis GEO-scan gedaan. Per e-mailadres is er één gratis scan beschikbaar. Hieronder vind je je eerdere rapport — wil je een nieuwe analyse? Plan dan even een korte sessie met NXTLI.";
          send({
            type: "result",
            data: {
              ok: true,
              scan_request_id: prior.id,
              status: "completed",
              preview: buildPreview(priorAnalysis),
              report_url: priorUrl,
              email_queued: false,
              blocked: true,
              message,
            },
          });
          return close();
        }

        // Best-effort per-instance backstop when NO DB is configured (the gate
        // above is then a no-op): throttle repeat emails so a missing DB can't
        // enable unlimited paid scans. Configure Postgres for an authoritative,
        // cross-instance gate.
        if (!isSupabaseConfigured() && wasRecentlyScanned(lead.email)) {
          send({
            type: "error",
            message:
              "Je hebt recent al een gratis GEO-scan met dit e-mailadres gedaan. Voor een nieuwe analyse plan je even een korte sessie met NXTLI.",
          });
          return close();
        }

        // 0b. Optional global daily cap (credit backstop).
        const dailyCap = Number(process.env.GEO_MAX_SCANS_PER_DAY);
        if (Number.isFinite(dailyCap) && dailyCap > 0) {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          if ((await countCompletedScansSince(since)) >= dailyCap) {
            send({
              type: "error",
              message:
                "We hebben vandaag al heel veel scans gedraaid. Probeer het morgen opnieuw — of plan direct een korte sessie met NXTLI.",
            });
            return close();
          }
        }

        // 1. Persist lead + scan request. The scan-request insert is also the
        // race-safe reservation: a concurrent scan for the same email trips the
        // DB's unique index and comes back as a conflict, so we block instead of
        // running a second paid analysis. (The in-memory throttle is only needed
        // — and only pruned — in the no-DB fallback, so only record there.)
        if (!isSupabaseConfigured()) markScanned(lead.email);
        const persistedLead = await insertLead(lead);
        const scan = await createScanRequest({
          leadId: persistedLead?.id ?? null,
          email: lead.email,
          homepageUrl: lead.homepage_url,
          rawInput: lead,
        });
        if (scan && "conflict" in scan) {
          send({
            type: "error",
            message:
              "Er loopt al een scan voor dit e-mailadres. Een momentje — probeer het zo opnieuw.",
          });
          return close();
        }
        scanRequestId = scan?.id ?? cryptoRandomId();
        if (scan) await updateScanRequest(scan.id, { status: "scanning" });
        progress(10, 0);

        // 2. Fetch the homepage + technical signals.
        const page = await fetchHomepage(lead.homepage_url);
        progress(30, 1);
        progress(34, 2);

        // 3. AI analysis — live progress from the streamed tokens (35% → 90%).
        const { result: analysis, degraded, providerId, usage } = await runGeoAnalysis(
          {
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
          },
          {
            onProgress: (frac) =>
              progress(35 + frac * 55, frac < 0.55 ? 2 : 3),
          },
        );
        progress(91, 4);

        // 4. Build the report.
        const reportHtml = buildReportHtml({ lead, analysis });
        putReportHtml(scanRequestId, reportHtml);
        const { pdfUrl } = await generatePdf({ html: reportHtml, scanRequestId });
        const reportUrl = `/api/geo/report/${scanRequestId}`;
        progress(95, 4);

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

        // 6. Email.
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

        // 7. Slack.
        await notifySlackNewLead({
          lead,
          status: "completed",
          analysis,
          reportUrl: baseUrl ? `${baseUrl}${reportUrl}` : reportUrl,
          degraded,
          providerId,
        });

        progress(100, 5);
        send({
          type: "result",
          data: {
            ok: true,
            scan_request_id: scanRequestId,
            status: "completed",
            preview: buildPreview(analysis),
            report_url: reportUrl,
            email_queued: email.sent,
            message: degraded
              ? "Je rapport staat klaar. We kijken er ook handmatig naar voor de puntjes op de i."
              : undefined,
          },
        });
        return close();
      } catch (error) {
        logError("api.geo.scan", error);
        if (scanRequestId) {
          await updateScanRequest(scanRequestId, {
            status: "failed",
            error_message: error instanceof Error ? error.message : "unknown",
          }).catch(() => undefined);
        }
        await notifySlackNewLead({ lead, status: "failed" }).catch(() => undefined);
        send({
          type: "error",
          message:
            "Er ging iets mis met de automatische scan. We hebben je aanvraag wel ontvangen en kunnen je rapport handmatig nasturen.",
        });
        return close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
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
  return `local-${globalThis.crypto?.randomUUID?.() ?? Math.abs(hash(String(Date.now())))}`;
}

/**
 * Best-effort per-instance throttle, used only as a backstop when no DB is
 * configured (the authoritative gate lives in Postgres). Process-local, so it
 * does not span serverless instances — it just limits trivial repeat credit
 * burn within one warm instance.
 */
const RECENT_SCAN_TTL_MS = 10 * 60 * 1000;
const recentScanEmails = new Map<string, number>();

function wasRecentlyScanned(email: string): boolean {
  const key = email.toLowerCase();
  const now = Date.now();
  for (const [k, ts] of recentScanEmails) {
    if (now - ts > RECENT_SCAN_TTL_MS) recentScanEmails.delete(k);
  }
  return recentScanEmails.has(key);
}

function markScanned(email: string): void {
  recentScanEmails.set(email.toLowerCase(), Date.now());
}

/** Hostname for user-facing copy (e.g. "tui.nl"); null if unparseable. */
function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

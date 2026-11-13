import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerBrand } from "@/lib/geo/brand-server";
import { parseAnalysisResult } from "@/lib/geo/analysis/provider";
import { sendGeoReportEmail } from "@/lib/geo/email/service";
import { reportPath } from "@/lib/geo/report/serve";
import { allow, clientIp, requestBaseUrl, sameOrigin } from "@/lib/geo/request";
import { findCompletedScanByEmail, getScanForReport } from "@/lib/geo/supabase/service";
import { isTestEmail } from "@/lib/geo/test-emails";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/geo/prior
 * De chat vraagt hier of er met een e-mailadres al een scan is gedaan, zodat de
 * bezoeker dat direct hoort en niet pas na alle vragen.
 *
 *  - action "check":  { known: boolean }
 *  - action "resend": mailt het eerdere rapport opnieuw. { sent: boolean }
 *
 * Het rapport gaat alleen naar het adres waarmee de scan is gedaan. Het
 * eindpunt geeft de rapportlink zelf nooit terug: wie een adres van een ander
 * intypt, krijgt het rapport dus niet te zien.
 */
const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  action: z.enum(["check", "resend"]),
});

export async function POST(request: Request): Promise<NextResponse> {
  if (!sameOrigin(request)) return NextResponse.json({ known: false }, { status: 403 });
  if (!allow("prior.ip", clientIp(request), 20, 10 * 60 * 1000)) {
    return NextResponse.json({ known: false }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ known: false }, { status: 400 });
  const { email, action } = parsed.data;

  // Een testadres mag vaker scannen, dus de chat meldt geen eerdere scan.
  if (isTestEmail(email)) return NextResponse.json({ known: false, sent: false });

  const prior = await findCompletedScanByEmail(email);
  if (action === "check") return NextResponse.json({ known: Boolean(prior) });
  if (!prior) return NextResponse.json({ known: false, sent: false });

  // Hooguit twee keer per uur per adres, zodat niemand een ander kan bestoken.
  if (!allow("prior.resend", email, 2, 60 * 60 * 1000)) {
    return NextResponse.json({ known: true, sent: false, reason: "limit" });
  }

  try {
    const scan = await getScanForReport(prior.id);
    const raw = (scan?.raw_input && typeof scan.raw_input === "object" ? scan.raw_input : {}) as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === "string" ? v : "");
    const base = requestBaseUrl(request);
    const path = reportPath(prior.id);
    const result = await sendGeoReportEmail({
      to: email,
      name: text(raw.name),
      companyName: text(raw.company_name),
      analysis: parseAnalysisResult(prior.analysis_result),
      reportHtml: "",
      reportUrl: base ? `${base}${path}` : path,
      pageUrl: prior.homepage_url,
      brand: await getServerBrand(),
    });
    return NextResponse.json({ known: true, sent: result.sent });
  } catch (error) {
    logError("api.geo.prior.resend", error);
    return NextResponse.json({ known: true, sent: false });
  }
}

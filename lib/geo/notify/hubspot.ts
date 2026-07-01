import type { GeoAnalysisResult, GeoLeadInput } from "../types";
import { logError, logInfo } from "../logger";

/**
 * HubSpot CRM adapter — upserts the lead as a HubSpot contact on every scan
 * submission, so the chat data lands as a lead in the CRM.
 *
 * Configure HUBSPOT_TOKEN (a Private App token with the `crm.objects.contacts.write`
 * scope, server-side only). Without it this is a no-op, so the scan flow never
 * depends on HubSpot being set up.
 *
 * Besides the standard contact properties (email/name/phone/company/jobtitle/
 * website/lifecyclestage) it writes three GEO-specific CUSTOM properties — create
 * these once in HubSpot → Settings → Properties → Contact:
 *   - geoscore          (Number)            the AI Visibility Score
 *   - geoscore_rapport  (Single-line text)  link to the report
 *   - geoscanpagina     (Single-line text)  the URL that was scanned
 *
 * Upsert is by email (CRM v3 batch upsert, idProperty=email) so re-submissions
 * update the same contact. If a custom property is missing/misnamed HubSpot
 * rejects the whole call, so we retry once with only the standard properties —
 * a bad custom-property name can never block the core lead sync.
 */
export interface HubspotUpsertParams {
  lead: GeoLeadInput;
  analysis?: GeoAnalysisResult | null;
  /** Absolute URL to the report, stored on the contact (geoscore_rapport). */
  reportUrl?: string | null;
}

export async function upsertHubspotContact(
  params: HubspotUpsertParams,
): Promise<{ sent: boolean }> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    logInfo("hubspot", "HUBSPOT_TOKEN not set — skipping contact upsert");
    return { sent: false };
  }

  const { lead } = params;
  const standard = buildStandardProperties(lead);
  const geo = buildGeoProperties(params);
  const hasGeo = Object.keys(geo).length > 0;

  try {
    let res = await upsert(token, lead.email, { ...standard, ...geo });

    // If a GEO custom property is misconfigured (unknown name/type → HubSpot
    // rejects the request), don't lose the lead: retry with standard fields only.
    if (!res.ok && hasGeo) {
      const detail = await res.text().catch(() => "");
      logError(
        "hubspot.upsert",
        `retrying without GEO properties after ${res.status} ${detail.slice(0, 160)}`,
      );
      res = await upsert(token, lead.email, standard);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logError("hubspot.upsert", `hubspot responded ${res.status} ${detail.slice(0, 200)}`);
      return { sent: false };
    }
    logInfo("hubspot", `contact upserted (${lead.email})`);
    return { sent: true };
  } catch (error) {
    logError("hubspot.upsert", error);
    return { sent: false };
  }
}

function upsert(
  token: string,
  email: string,
  properties: Record<string, string>,
): Promise<Response> {
  return fetch("https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: [{ idProperty: "email", id: email, properties }] }),
  });
}

/** Standard HubSpot contact properties (always exist). */
function buildStandardProperties(lead: GeoLeadInput): Record<string, string> {
  const parts = lead.name.trim().split(/\s+/);
  const firstname = parts[0] ?? "";
  const lastname = parts.slice(1).join(" ");

  const properties: Record<string, string> = {
    email: lead.email,
    firstname,
    phone: lead.phone,
    company: lead.company_name,
    jobtitle: lead.job_title,
    website: lead.homepage_url,
    lifecyclestage: "lead",
  };
  if (lastname) properties.lastname = lastname;
  return properties;
}

/** GEO-specific custom properties (must exist in HubSpot; see file header). */
function buildGeoProperties(params: HubspotUpsertParams): Record<string, string> {
  const { lead, analysis, reportUrl } = params;
  const properties: Record<string, string> = {};
  if (typeof analysis?.visibility_score === "number") {
    properties.geoscore = String(analysis.visibility_score);
  }
  if (reportUrl) properties.geoscore_rapport = reportUrl;
  if (lead.homepage_url) properties.geoscanpagina = lead.homepage_url;
  return properties;
}

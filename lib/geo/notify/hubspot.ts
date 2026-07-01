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
 * Create the token: HubSpot → Settings → Integrations → Private Apps → Create,
 * add the `crm.objects.contacts.write` scope, copy the token into HUBSPOT_TOKEN.
 *
 * Upsert is by email (CRM v3 batch upsert, idProperty=email), so re-submissions
 * update the same contact instead of creating duplicates. Only standard contact
 * properties are sent by default; set HUBSPOT_SCORE_PROPERTY to the internal name
 * of a custom number property to also push the AI Visibility Score.
 */
export interface HubspotUpsertParams {
  lead: GeoLeadInput;
  analysis?: GeoAnalysisResult | null;
}

export async function upsertHubspotContact(
  params: HubspotUpsertParams,
): Promise<{ sent: boolean }> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    logInfo("hubspot", "HUBSPOT_TOKEN not set — skipping contact upsert");
    return { sent: false };
  }

  try {
    const properties = buildProperties(params);
    const res = await fetch(
      "https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: [{ idProperty: "email", id: params.lead.email, properties }],
        }),
      },
    );
    if (!res.ok) {
      // Body may explain a bad property/scope; keep it server-side only.
      const detail = await res.text().catch(() => "");
      logError("hubspot.upsert", `hubspot responded ${res.status} ${detail.slice(0, 200)}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (error) {
    logError("hubspot.upsert", error);
    return { sent: false };
  }
}

function buildProperties(params: HubspotUpsertParams): Record<string, string> {
  const { lead, analysis } = params;
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

  // Optional: push the score into a custom number property when configured.
  const scoreProp = process.env.HUBSPOT_SCORE_PROPERTY;
  if (scoreProp && typeof analysis?.visibility_score === "number") {
    properties[scoreProp] = String(analysis.visibility_score);
  }

  return properties;
}

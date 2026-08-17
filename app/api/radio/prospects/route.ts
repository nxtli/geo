import { NextResponse } from "next/server";
import { addProspect, listProspects } from "@/lib/radio/store";
import { computeStats, filterProspects, sortProspects } from "@/lib/radio/filters";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/radio/prospects — de volledige lijst plus statistieken.
 * POST /api/radio/prospects — één bedrijf toevoegen (naam + website).
 */
export async function GET(): Promise<NextResponse> {
  try {
    const prospects = await listProspects();
    return NextResponse.json({
      ok: true,
      prospects: sortProspects(filterProspects(prospects)),
      stats: computeStats(prospects),
    });
  } catch (error) {
    logError("radio.api.prospects.list", error);
    return NextResponse.json(
      { ok: false, error: "Kon de prospectlijst niet laden." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Ongeldige JSON." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const companyName = typeof input.company_name === "string" ? input.company_name.trim() : "";
  const website = typeof input.website === "string" ? input.website.trim() : "";

  if (!companyName && !website) {
    return NextResponse.json(
      { ok: false, error: "Geef minimaal een bedrijfsnaam of een website." },
      { status: 400 },
    );
  }

  try {
    const { prospect, duplicate } = await addProspect({
      // Zonder naam maar met website: de host is een bruikbare voorlopige naam.
      company_name: companyName || hostFrom(website) || website,
      website: website || null,
      linkedin_url: asString(input.linkedin_url),
      contact_first_name: asString(input.contact_first_name),
      contact_last_name: asString(input.contact_last_name),
      contact_title: asString(input.contact_title),
      city: asString(input.city),
      industry: asString(input.industry),
      segment: asString(input.segment),
      notes: asString(input.notes),
      contact_source: asString(input.contact_source) ?? "handmatig",
    });

    return NextResponse.json({
      ok: true,
      prospect,
      duplicate,
      message: duplicate
        ? `${prospect.company_name} stond al in de lijst — bestaande gegevens zijn aangevuld.`
        : `${prospect.company_name} toegevoegd.`,
    });
  } catch (error) {
    logError("radio.api.prospects.create", error);
    return NextResponse.json(
      { ok: false, error: "Kon de prospect niet opslaan." },
      { status: 500 },
    );
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hostFrom(website: string): string | null {
  if (!website) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

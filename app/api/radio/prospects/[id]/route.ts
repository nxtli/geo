import { NextResponse } from "next/server";
import { deleteProspect, getProspect, updateProspect } from "@/lib/radio/store";
import { PROSPECT_STATUSES, type ProspectStatus } from "@/lib/radio/types";
import { sanitizeLinkedInUrl } from "@/lib/radio/validation";
import { normalizeSegment } from "@/lib/radio/segments";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/radio/prospects/[id]
 *
 * Werkt de velden bij die Eric zelf beheert: status, notities, contactpersoon,
 * LinkedIn-URL, segment. Scores worden hier NIET aangepast — die komen alleen
 * uit de scoring-engine.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Ongeldige JSON." }, { status: 400 });
  }

  const existing = await getProspect(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Prospect niet gevonden." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.status === "string") {
    if (!PROSPECT_STATUSES.includes(body.status as ProspectStatus)) {
      return NextResponse.json(
        { ok: false, error: `Onbekende status "${body.status}".` },
        { status: 400 },
      );
    }
    patch.status = body.status;
  }

  if ("notes" in body) {
    patch.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  }

  if ("segment" in body) {
    patch.segment = normalizeSegment(typeof body.segment === "string" ? body.segment : null);
  }

  // Contactvelden worden als geheel bijgewerkt zodat er geen halve persoon
  // ontstaat. Een LinkedIn-URL wordt gevalideerd: onbruikbaar → weigeren met
  // uitleg, in plaats van iets kapots opslaan.
  const contactKeys = [
    "contact_first_name",
    "contact_last_name",
    "contact_title",
    "linkedin_url",
  ] as const;

  if (contactKeys.some((key) => key in body)) {
    const contact = { ...existing.contact };

    if ("contact_first_name" in body) contact.first_name = trimOrNull(body.contact_first_name);
    if ("contact_last_name" in body) contact.last_name = trimOrNull(body.contact_last_name);
    if ("contact_title" in body) contact.title = trimOrNull(body.contact_title);

    if ("linkedin_url" in body) {
      const raw = trimOrNull(body.linkedin_url);
      if (raw === null) {
        contact.linkedin_url = null;
      } else {
        const clean = sanitizeLinkedInUrl(raw);
        if (!clean) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Die LinkedIn-URL herken ik niet. Verwacht een linkedin.com/in/… of /company/…-adres.",
            },
            { status: 400 },
          );
        }
        contact.linkedin_url = clean;
      }
    }

    if (!contact.source && (contact.first_name || contact.linkedin_url)) {
      contact.source = "handmatig";
    }
    patch.contact = contact;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Niets om bij te werken." }, { status: 400 });
  }

  try {
    const updated = await updateProspect(id, patch);
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Prospect niet gevonden." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, prospect: updated });
  } catch (error) {
    logError("radio.api.prospects.update", error);
    return NextResponse.json({ ok: false, error: "Bijwerken mislukt." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  try {
    const removed = await deleteProspect(id);
    if (!removed) {
      return NextResponse.json({ ok: false, error: "Prospect niet gevonden." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("radio.api.prospects.delete", error);
    return NextResponse.json({ ok: false, error: "Verwijderen mislukt." }, { status: 500 });
  }
}

function trimOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

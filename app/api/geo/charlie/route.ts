import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerBrand } from "@/lib/geo/brand-server";
import { CHARLIE_STEPS } from "@/lib/geo/charlie";
import { generateCharlieReply, MAX_ANSWER_CHARS } from "@/lib/geo/charlie-reply";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/geo/charlie
 * Charlie reageert op een vraag van de bezoeker tijdens de vragenlijst.
 * Geeft { reply: null } terug als er geen antwoord komt; de chat gebruikt dan
 * het vaste antwoord.
 *
 * Dit eindpunt is openbaar en kost per aanroep geld. Daarom: alleen verzoeken
 * van de eigen site, korte invoer, een kort antwoord en een limiet per adres.
 */
const STEP_KEYS = CHARLIE_STEPS.map((s) => s.key) as [string, ...string[]];
const short = z.string().max(MAX_ANSWER_CHARS * 2).nullish();

const bodySchema = z.object({
  step: z.enum(STEP_KEYS),
  answer: z.string().trim().min(1).max(MAX_ANSWER_CHARS),
  pending: short,
  context: z
    .object({
      company_name: short,
      homepage_url: short,
      offer_description: short,
      target_audience: short,
      desired_queries: short,
    })
    .partial()
    .optional(),
});

// Limiet per IP-adres. Geldt per serverinstantie, dus een rem en geen slot.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 25;
const hits = new Map<string, number[]>();

function allow(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!sameOrigin(request)) return NextResponse.json({ reply: null }, { status: 403 });

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "onbekend";
  if (!allow(ip)) return NextResponse.json({ reply: null }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ reply: null }, { status: 400 });

  const brand = await getServerBrand();
  const result = await generateCharlieReply(
    {
      step: parsed.data.step as (typeof CHARLIE_STEPS)[number]["key"],
      answer: parsed.data.answer,
      pending: parsed.data.pending ?? null,
      context: parsed.data.context,
    },
    brand,
  );
  return NextResponse.json(result ?? { reply: null });
}

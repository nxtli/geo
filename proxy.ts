import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic Auth gate voor de interne schermen.
 *
 * Beschermt:
 *  - `/admin/**` — het verborgen GEO-scanoverzicht.
 *  - `/radio/**` en `/api/radio/**` — de prospect-tool van Adverteren op de
 *    Radio, die commerciële prospectdata bevat en nooit publiek mag staan.
 *
 * De publieke GEO-landingspagina en `/api/geo/**` blijven vrij toegankelijk.
 *
 * Credentials komen uit env (ADMIN_USERNAME / ADMIN_PASSWORD) — zet ze in
 * Vercel. Ontbreken ze, dan is `/admin` op slot (503) in plaats van open.
 * Voor `/radio` geldt dat ook in productie; lokaal (`npm run dev`) mag het wél
 * door met een waarschuwing, zodat de tool zonder configuratie te starten is.
 *
 * Gebruikt de Next 16 `proxy`-conventie (de opvolger van `middleware`).
 */
export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/radio",
    "/radio/:path*",
    "/api/radio/:path*",
  ],
};

/**
 * Headers van het 401-antwoord.
 *
 * ALLEEN ASCII: headerwaarden zijn ByteStrings, dus een teken buiten latin-1
 * (zoals een em-dash) laat de Response-constructor gooien. Het gevolg is een
 * 500 in plaats van een 401 — en dan toont de browser nooit een inlogprompt en
 * kan niemand meer inloggen. Bewaakt door een test.
 */
export const AUTH_CHALLENGE_HEADERS: Record<string, string> = {
  "WWW-Authenticate": 'Basic realm="NXTLI intern", charset="UTF-8"',
  "X-Robots-Tag": "noindex, nofollow",
};

export function proxy(req: NextRequest) {
  const user = process.env.ADMIN_USERNAME;
  const pass = process.env.ADMIN_PASSWORD;

  if (!user || !pass) {
    // Alleen de radio-tool mag lokaal zonder credentials door, zodat de MVP
    // direct te starten is. In productie gaat alles op slot.
    const isRadio =
      req.nextUrl.pathname === "/radio" ||
      req.nextUrl.pathname.startsWith("/radio/") ||
      req.nextUrl.pathname.startsWith("/api/radio/");

    if (isRadio && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[radio:auth] ADMIN_USERNAME/ADMIN_PASSWORD niet gezet — /radio staat lokaal open. " +
          "Zet ze voordat je deployt.",
      );
      return NextResponse.next();
    }

    return new NextResponse(
      "Niet geconfigureerd (ADMIN_USERNAME / ADMIN_PASSWORD ontbreken).",
      { status: 503, headers: { "X-Robots-Tag": "noindex, nofollow" } },
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try {
      decoded = atob(encoded);
    } catch {
      decoded = "";
    }
    // Alleen op de EERSTE dubbele punt splitsen: een wachtwoord mag er zelf ook
    // een bevatten.
    const sep = decoded.indexOf(":");
    if (sep !== -1) {
      const u = decoded.slice(0, sep);
      const p = decoded.slice(sep + 1);
      if (safeEqual(u, user) && safeEqual(p, pass)) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("Authenticatie vereist.", {
    status: 401,
    headers: AUTH_CHALLENGE_HEADERS,
  });
}

/**
 * Constant-tijd vergelijking. Het lengteverschil wordt in het resultaat
 * meegenomen in plaats van vroeg te returnen, zodat de responstijd ook de lengte
 * van het wachtwoord niet verklapt.
 */
function safeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

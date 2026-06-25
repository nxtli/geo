import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic Auth gate for the hidden /admin dashboard.
 *
 * Credentials come from env (ADMIN_USERNAME / ADMIN_PASSWORD) — set them in
 * Vercel. If unset, /admin is locked (503) rather than open. Not linked
 * anywhere and excluded from indexing (see app/admin/page.tsx metadata).
 */
export const config = {
  matcher: ["/admin", "/admin/:path*"],
};

export function middleware(req: NextRequest) {
  const user = process.env.ADMIN_USERNAME;
  const pass = process.env.ADMIN_PASSWORD;

  if (!user || !pass) {
    return new NextResponse(
      "Admin is niet geconfigureerd (ADMIN_USERNAME / ADMIN_PASSWORD ontbreken).",
      { status: 503 },
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
    headers: {
      "WWW-Authenticate": 'Basic realm="NXTLI GEO Admin", charset="UTF-8"',
    },
  });
}

/** Constant-time-ish comparison to avoid trivial timing leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

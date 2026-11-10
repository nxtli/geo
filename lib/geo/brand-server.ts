import { cookies, headers } from "next/headers";
import { BRAND_COOKIE, BRANDS, resolveBrandId, type Brand } from "./brand";

/** Huisstijl voor het lopende verzoek (server components en route handlers). */
export async function getServerBrand(): Promise<Brand> {
  const h = await headers();
  const c = await cookies();
  return BRANDS[
    resolveBrandId({
      env: process.env.GEO_BRAND,
      cookie: c.get(BRAND_COOKIE)?.value,
      host: h.get("x-forwarded-host") ?? h.get("host"),
    })
  ];
}

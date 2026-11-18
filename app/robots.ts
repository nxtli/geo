import type { MetadataRoute } from "next";
import { getServerBrand } from "@/lib/geo/brand-server";

/**
 * Zoekmachines en AI-zoekbots mogen de landingspagina ophalen. Rapporten,
 * beheer en de API blijven erbuiten: die zijn van één bezoeker of intern.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const brand = await getServerBrand();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] }],
    sitemap: `${brand.siteUrl}/sitemap.xml`,
  };
}

import type { MetadataRoute } from "next";
import { getServerBrand } from "@/lib/geo/brand-server";
import { LANDING_UPDATED } from "@/lib/geo/landing";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const brand = await getServerBrand();
  return [{ url: `${brand.siteUrl}/`, lastModified: LANDING_UPDATED.iso, changeFrequency: "monthly", priority: 1 }];
}

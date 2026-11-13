import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { getServerBrand } from "@/lib/geo/brand-server";
import { BrandProvider } from "@/components/geo/brand-context";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerBrand();
  const siteName = brand.id === "mat" ? "Marketing AI Team" : brand.product;
  return {
    metadataBase: new URL(brand.siteUrl),
    title: { default: brand.meta.title, template: `%s | ${brand.product}` },
    description: brand.meta.description,
    alternates: { canonical: "/" },
    openGraph: {
      title: brand.meta.title,
      description: brand.meta.description,
      url: brand.siteUrl,
      siteName,
      locale: "nl_NL",
      type: "website",
      images: [{ url: brand.logo.src.startsWith("http") ? brand.logo.src : `${brand.siteUrl}${brand.logo.src}`, alt: brand.logo.alt }],
    },
    twitter: { card: "summary", title: brand.meta.title, description: brand.meta.description },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brand = await getServerBrand();
  return (
    <html lang="nl" data-brand={brand.id} className={brand.id === "mat" ? GeistSans.variable : undefined}>
      <body>
        <BrandProvider id={brand.id}>{children}</BrandProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { getServerBrand } from "@/lib/geo/brand-server";
import { BrandProvider } from "@/components/geo/brand-context";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerBrand();
  return {
    metadataBase: new URL(brand.siteUrl),
    title: { default: brand.meta.title, template: `%s | ${brand.product}` },
    description: brand.meta.description,
    openGraph: {
      title: brand.meta.title,
      description: brand.meta.description,
      url: brand.siteUrl,
      siteName: brand.id === "mat" ? "Marketing AI Team" : brand.product,
      locale: "nl_NL",
      type: "website",
    },
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

import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://geo.nxtli.com"),
  title: {
    default: "NXTLI GEO Scan — Word jij gevonden in AI-zoekresultaten?",
    template: "%s — NXTLI GEO Scan",
  },
  description:
    "Ontdek gratis hoe goed jouw website zichtbaar is voor ChatGPT, Claude en andere AI-antwoorden — en wat je kunt verbeteren om vaker genoemd te worden.",
  openGraph: {
    title: "NXTLI GEO Scan — Word jij gevonden in AI-zoekresultaten?",
    description:
      "Gratis AI-vindbaarheidsscan van je homepage, begeleid door Brian, de AI-analist van NXTLI.",
    url: "https://geo.nxtli.com",
    siteName: "NXTLI GEO Scan",
    locale: "nl_NL",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}

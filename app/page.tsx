import { GeoLandingPage } from "@/components/geo/GeoLandingPage";
import { getServerBrand } from "@/lib/geo/brand-server";
import { landingJsonLd } from "@/lib/geo/landing-schema";

export default async function Page() {
  const brand = await getServerBrand();
  return (
    <>
      {/* Gestructureerde gegevens voor gewone zoekmachines. Het "<" is ontsnapt, zodat tekst nooit uit het script breekt. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd(brand)).replace(/</g, "\\u003c") }}
      />
      <GeoLandingPage />
    </>
  );
}

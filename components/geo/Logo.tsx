"use client";

import * as React from "react";
import { useBrand } from "./brand-context";

/**
 * Logo van de afzender (zie lib/geo/brand.ts). Laadt het beeld niet, dan valt
 * het terug op de naam in tekst, zodat er nooit een kapotte afbeelding staat.
 */
export function Logo({
  className = "h-8 w-auto",
  fallbackClassName = "font-display text-xl font-bold tracking-tight text-ink",
}: {
  className?: string;
  fallbackClassName?: string;
}) {
  const brand = useBrand();
  const [failed, setFailed] = React.useState(false);

  if (failed) return <span className={fallbackClassName}>{brand.name}</span>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brand.logo.src}
      alt={brand.logo.alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

"use client";

import * as React from "react";

/**
 * NXTLI logo. Renders /nxtli-logo.png; if that file isn't present (yet) it
 * gracefully falls back to the "NXTLI" wordmark, so there's never a broken
 * image. Drop the real logo at public/nxtli-logo.png to activate it.
 */
export function Logo({
  className = "h-8 w-auto",
  fallbackClassName = "font-display text-xl font-bold tracking-tight text-ink",
}: {
  className?: string;
  fallbackClassName?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  if (failed) return <span className={fallbackClassName}>NXTLI</span>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/nxtli-logo.png"
      alt="NXTLI"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

"use client";

import * as React from "react";
import { CHARLIE } from "@/lib/geo/charlie";
import { cn } from "./primitives";

/**
 * Charlie's avatar. Two ways to set the photo (either works):
 *   1. Add the image to the repo as `public/charlie.jpg`, or
 *   2. Set NEXT_PUBLIC_CHARLIE_AVATAR_URL to any hosted image URL (no commit).
 * Falls back to the "B" monogram if neither is present, so the UI never breaks.
 */
const AVATAR_SRC =
  process.env.NEXT_PUBLIC_CHARLIE_AVATAR_URL || "/charlie.jpg";
const SIZES = {
  sm: "h-8 w-8 text-sm",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
} as const;

export function CharlieAvatar({
  size = "sm",
  withStatus = false,
  className,
}: {
  size?: keyof typeof SIZES;
  withStatus?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  return (
    <div className={cn("relative shrink-0 select-none", SIZES[size], className)}>
      {failed ? (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-brand font-bold text-brand-fg shadow-soft">
          {CHARLIE.avatarInitial}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={AVATAR_SRC}
          alt="Charlie, AI-analist bij NXTLI"
          onError={() => setFailed(true)}
          className="h-full w-full rounded-full object-cover shadow-soft"
        />
      )}
      {withStatus ? (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-success" />
      ) : null}
    </div>
  );
}

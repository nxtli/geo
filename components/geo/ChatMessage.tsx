"use client";

import * as React from "react";
import { cn } from "./primitives";
import { BrianAvatar } from "./BrianAvatar";

export interface ChatMessageData {
  id: string;
  from: "brian" | "user";
  text: string;
}

export function ChatMessage({ message }: { message: ChatMessageData }) {
  const isBrian = message.from === "brian";
  return (
    <div
      className={cn(
        "flex w-full animate-fade-up items-end gap-2.5",
        isBrian ? "justify-start" : "justify-end",
      )}
    >
      {isBrian && <BrianAvatar />}
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
          isBrian
            ? "rounded-bl-md bg-elevated text-ink"
            : "rounded-br-md bg-brand text-brand-fg",
        )}
      >
        {message.text}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex animate-fade-in items-end gap-2.5">
      <BrianAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-elevated px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 animate-bounce-dot rounded-full bg-subtle"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

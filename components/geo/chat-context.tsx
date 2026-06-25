"use client";

import * as React from "react";
import { BrianChat } from "./BrianChat";

interface GeoChatContextValue {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const GeoChatContext = React.createContext<GeoChatContextValue | null>(null);

export function useGeoChat(): GeoChatContextValue {
  const ctx = React.useContext(GeoChatContext);
  if (!ctx) throw new Error("useGeoChat must be used within GeoChatProvider");
  return ctx;
}

/**
 * Provides the "open Brian" action to the whole landing page and keeps the
 * chat component permanently mounted (just hidden) so the visitor never loses
 * their answers when they close and reopen it.
 */
export function GeoChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);

  const open = React.useCallback(() => setIsOpen(true), []);
  const close = React.useCallback(() => setIsOpen(false), []);

  const value = React.useMemo(
    () => ({ open, close, isOpen }),
    [open, close, isOpen],
  );

  return (
    <GeoChatContext.Provider value={value}>
      {children}
      <BrianChat isOpen={isOpen} onClose={close} />
    </GeoChatContext.Provider>
  );
}

"use client";

import * as React from "react";
import { BRANDS, type Brand, type BrandId } from "@/lib/geo/brand";

const BrandContext = React.createContext<Brand>(BRANDS.nxtli);

export function BrandProvider({ id, children }: { id: BrandId; children: React.ReactNode }) {
  return <BrandContext.Provider value={BRANDS[id]}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  return React.useContext(BrandContext);
}

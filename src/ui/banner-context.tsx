import { createContext, useContext, useEffect } from "react";
import type { BannerContext } from "../data/ad-policy";

export const BannerPlacement = createContext<(c: BannerContext | null) => void>(
  () => {},
);
// Detail screens opt in only AFTER their server-authorized ended-record read.
export function useRecordBanner(
  screen: "record-detail" | "peoria",
  allowed: boolean,
) {
  const set = useContext(BannerPlacement);
  useEffect(() => {
    if (allowed) set({ screen, flow: "record", roundEnded: true });
    else set(null);
    return () => set(null);
  }, [allowed, screen, set]);
}

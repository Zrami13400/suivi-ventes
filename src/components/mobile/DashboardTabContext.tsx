"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { DASHBOARD_TABS, isDashboardTab, type DashboardTab } from "@/lib/dashboardTabs";

export { DASHBOARD_TABS, isDashboardTab, type DashboardTab };

/** Badges courts affichés sous les onglets du bas (ex. "29 €", "3ème"). */
export interface DashboardTabBadges {
  prime: string | null;
  rang: string | null;
}

interface Ctx {
  tab: DashboardTab;
  setTab: (t: DashboardTab) => void;
  badges: DashboardTabBadges;
  setBadges: (b: Partial<DashboardTabBadges>) => void;
}

const DashboardTabCtx = createContext<Ctx | null>(null);

export function DashboardTabProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<DashboardTab>("accueil");
  const [badges, setBadgesState] = useState<DashboardTabBadges>({
    prime: null,
    rang: null,
  });
  const setBadges = (b: Partial<DashboardTabBadges>) =>
    setBadgesState((prev) => ({ ...prev, ...b }));
  const value = useMemo(
    () => ({ tab, setTab, badges, setBadges }),
    [tab, badges],
  );
  return <DashboardTabCtx.Provider value={value}>{children}</DashboardTabCtx.Provider>;
}

export function useDashboardTab(): Ctx {
  const ctx = useContext(DashboardTabCtx);
  if (!ctx) {
    throw new Error("useDashboardTab must be used within DashboardTabProvider");
  }
  return ctx;
}

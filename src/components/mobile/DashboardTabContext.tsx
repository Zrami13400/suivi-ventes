"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { DASHBOARD_TABS, isDashboardTab, type DashboardTab } from "@/lib/dashboardTabs";

export { DASHBOARD_TABS, isDashboardTab, type DashboardTab };

interface Ctx {
  tab: DashboardTab;
  setTab: (t: DashboardTab) => void;
}

const DashboardTabCtx = createContext<Ctx | null>(null);

export function DashboardTabProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<DashboardTab>("accueil");
  const value = useMemo(() => ({ tab, setTab }), [tab]);
  return <DashboardTabCtx.Provider value={value}>{children}</DashboardTabCtx.Provider>;
}

export function useDashboardTab(): Ctx {
  const ctx = useContext(DashboardTabCtx);
  if (!ctx) {
    throw new Error("useDashboardTab must be used within DashboardTabProvider");
  }
  return ctx;
}

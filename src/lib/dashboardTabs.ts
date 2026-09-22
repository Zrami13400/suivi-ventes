export const DASHBOARD_TABS = ["accueil", "stats", "equipe", "prime", "plus"] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export function isDashboardTab(value: string | null | undefined): value is DashboardTab {
  return !!value && (DASHBOARD_TABS as readonly string[]).includes(value);
}

"use client";

import { Coins, Home, LayoutGrid, LineChart, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "../ui";
import { type DashboardTab, useDashboardTab } from "./DashboardTabContext";

// Association onglet → clé de badge (voir DashboardTabBadges). Les autres
// onglets n'ont pas de badge court pertinent.
const BADGE_KEY: Partial<Record<DashboardTab, "prime" | "rang">> = {
  prime: "prime",
  equipe: "rang",
};

const ITEMS: { key: DashboardTab; label: string; icon: typeof Home }[] = [
  { key: "accueil", label: "Accueil", icon: Home },
  { key: "stats", label: "Stats", icon: LineChart },
  { key: "equipe", label: "Équipe", icon: Users },
  { key: "prime", label: "Prime", icon: Coins },
  { key: "plus", label: "Plus", icon: LayoutGrid },
];

export function BottomNav() {
  const pathname = usePathname();
  const { tab, setTab, badges } = useDashboardTab();
  const onDashboard = pathname === "/dashboard";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur lg:hidden">
      {ITEMS.map((it) => {
        const active = onDashboard && tab === it.key;
        const Icon = it.icon;
        const badgeKey = BADGE_KEY[it.key];
        const badgeValue = badgeKey ? badges[badgeKey] : null;
        const content = (
          <>
            <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            <span className="leading-tight">
              {it.label}
              {badgeValue && (
                <span className="block text-[9px] font-semibold normal-case opacity-80">
                  {badgeValue}
                </span>
              )}
            </span>
          </>
        );
        const className = cx(
          "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition",
          active ? "text-rose-400" : "text-slate-400",
        );

        if (onDashboard) {
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => setTab(it.key)}
              aria-pressed={active}
              className={className}
            >
              {content}
            </button>
          );
        }
        return (
          <Link key={it.key} href={`/dashboard?tab=${it.key}`} className={className}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import { useEffect } from "react";
import { formatMoney } from "@/lib/format";
import { AccueilDashboard, type AccueilDashboardProps } from "../accueil/AccueilDashboard";
import { useDashboardTab } from "./DashboardTabContext";

function ordinal(n: number): string {
  return n === 1 ? "er" : "ème";
}

/** Onglet Accueil mobile : même tableau de bord, + badges de la barre du bas. */
export function AccueilTab(props: Omit<AccueilDashboardProps, "onPrimeTotal">) {
  const { rang } = props;
  const { setBadges } = useDashboardTab();

  useEffect(() => {
    setBadges({ rang: rang ? `${rang}${ordinal(rang)}` : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rang]);

  return (
    <AccueilDashboard
      {...props}
      onPrimeTotal={(total) => setBadges({ prime: formatMoney(total) })}
    />
  );
}

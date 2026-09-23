"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Masque ses enfants sur /dashboard. Côté client (usePathname) : le layout
 * n'est pas re-rendu lors d'une navigation, un test côté serveur resterait figé.
 */
export function HideOnDashboard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/dashboard") return null;
  return <>{children}</>;
}

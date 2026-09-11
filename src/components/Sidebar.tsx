"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import type { Role } from "@/lib/types";
import { cx } from "./ui";

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

const ICONS = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5",
  target:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  cart: "M3 4h2l2.4 12.3a2 2 0 0 0 2 1.7h7.7a2 2 0 0 0 2-1.6L23 8H6M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  trophy:
    "M8 21h8m-4-4v4m-7-17h14v3a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5V4Zm0 2H3a3 3 0 0 0 3 3m13-3h2a3 3 0 0 1-3 3",
  swords:
    "M14.5 3H21v6.5M21 3l-9 9M9.5 21H3v-6.5M3 21l6-6M3 3l6 6M21 21l-6-6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0",
  shield: "M12 3l8 3v6c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6l8-3Z",
  chart: "M4 20V10m6 10V4m6 16v-7m6 7V8",
  calendar:
    "M7 3v3m10-3v3M4 8h16M5 5.5h14A1.5 1.5 0 0 1 20.5 7v12A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5Z",
} as const;

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("h-5 w-5", className)}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

export const SELLER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Accueil", icon: "home" },
  { href: "/objectifs", label: "Mes objectifs", icon: "target" },
  { href: "/ventes", label: "Mes ventes / Actes", icon: "cart" },
  { href: "/classement", label: "Classement", icon: "trophy" },
  { href: "/challenges", label: "Challenges", icon: "swords" },
  { href: "/planning", label: "Planning", icon: "calendar" },
  { href: "/profil", label: "Mon profil", icon: "user" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  role,
  nomComplet,
  shopNom,
}: {
  role: Role;
  nomComplet: string;
  shopNom: string;
}) {
  const pathname = usePathname();
  const items = [
    ...SELLER_NAV,
    ...(role === "admin"
      ? [{ href: "/admin", label: "Administration", icon: "shield" as const }]
      : []),
  ];

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface/70 px-3 py-5 backdrop-blur lg:flex">
      <Link href="/dashboard" className="flex items-center gap-2 px-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl grad-freebox text-lg font-black text-white">
          F
        </span>
        <span className="text-lg font-bold tracking-tight text-white">
          FreeKpi
        </span>
      </Link>
      <p className="mt-1 px-2 text-xs text-slate-500">{shopNom || "Boutique"}</p>

      <nav className="mt-6 flex flex-1 flex-col gap-1">
        {items.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-brand/15 text-white ring-1 ring-brand/30"
                  : "text-slate-400 hover:bg-surface-strong hover:text-white",
              )}
            >
              <Icon d={ICONS[it.icon]} className={active ? "text-brand-soft" : ""} />
              {it.label}
            </Link>
          );
        })}
      </nav>

      <form action={signOut} className="mt-4 border-t border-line pt-4">
        <p className="px-3 text-sm font-medium text-white">{nomComplet}</p>
        <p className="px-3 text-xs capitalize text-slate-500">{role}</p>
        <button type="submit" className="btn-ghost mt-3 w-full">
          Déconnexion
        </button>
      </form>
    </aside>
  );
}

export function MobileNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items: NavItem[] = [
    { href: "/dashboard", label: "Accueil", icon: "home" },
    { href: "/ventes", label: "Actes", icon: "cart" },
    { href: "/classement", label: "Stats", icon: "chart" },
    { href: "/profil", label: "Profil", icon: "user" },
    ...(role === "admin"
      ? [{ href: "/admin", label: "Admin", icon: "shield" as const }]
      : []),
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 backdrop-blur lg:hidden">
      {items.map((it) => {
        const active = isActive(pathname, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cx(
              "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition",
              active ? "text-brand-soft" : "text-slate-400",
            )}
          >
            <Icon d={ICONS[it.icon]} />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

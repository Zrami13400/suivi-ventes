import { ClipboardList, Coins, Target, UserPlus } from "lucide-react";
import Link from "next/link";

const LINKS = [
  { href: "/admin/vendeurs", label: "Ajouter un vendeur", icon: UserPlus },
  { href: "/admin/primes", label: "Barème des primes", icon: Coins },
  { href: "/admin/objectifs", label: "Objectifs", icon: Target },
  { href: "/admin/planning", label: "Planning", icon: ClipboardList },
];

/** Accès direct admin depuis l'Accueil — évite de passer par l'onglet Plus. */
export function AdminQuickAccess() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {LINKS.map((l) => {
        const Icon = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface-strong px-3 py-3 text-center transition hover:border-brand/40 hover:bg-surface"
          >
            <Icon className="h-5 w-5 text-brand-soft" strokeWidth={1.8} aria-hidden />
            <span className="text-xs font-medium leading-tight text-white">{l.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

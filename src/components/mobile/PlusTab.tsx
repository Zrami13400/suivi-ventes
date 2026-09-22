import {
  ChevronRight,
  ClipboardList,
  Coins,
  Layers,
  Smartphone,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import type { Role } from "@/lib/types";
import { Avatar } from "../ui";

const ADMIN_LINKS = [
  { href: "/admin/vendeurs", label: "Vendeurs", icon: Users },
  { href: "/admin/primes", label: "Règles de primes", icon: Coins },
  { href: "/admin/objectifs", label: "Objectifs", icon: Target },
  { href: "/admin/planning", label: "Planning", icon: ClipboardList },
  { href: "/admin/modeles", label: "Modèles", icon: Smartphone },
];

export function PlusTab({
  role,
  nomComplet,
  avatarUrl,
  niveauLabel,
}: {
  role: Role;
  nomComplet: string;
  avatarUrl: string | null;
  niveauLabel: string;
}) {
  return (
    <div className="space-y-5 pb-4">
      <div className="card flex items-center gap-3 p-4">
        <Avatar name={nomComplet} avatarUrl={avatarUrl} size={48} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{nomComplet}</p>
          <p className="text-xs capitalize text-slate-400">
            {role} · {niveauLabel}
          </p>
        </div>
      </div>

      {role === "admin" && (
        <div className="card divide-y divide-line/60 p-0">
          {ADMIN_LINKS.map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-white"
              >
                <Icon className="h-4 w-4 text-slate-400" strokeWidth={1.8} aria-hidden />
                <span className="flex-1">{l.label}</span>
                <ChevronRight className="h-4 w-4 text-slate-500" strokeWidth={1.8} aria-hidden />
              </Link>
            );
          })}
          <Link
            href="/admin"
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-white"
          >
            <Layers className="h-4 w-4 text-slate-400" strokeWidth={1.8} aria-hidden />
            <span className="flex-1">Vue d&apos;ensemble administration</span>
            <ChevronRight className="h-4 w-4 text-slate-500" strokeWidth={1.8} aria-hidden />
          </Link>
        </div>
      )}

      <div className="card divide-y divide-line/60 p-0">
        <Link
          href="/profil"
          className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-white"
        >
          <span className="flex-1">Mon profil complet</span>
          <ChevronRight className="h-4 w-4 text-slate-500" strokeWidth={1.8} aria-hidden />
        </Link>
        <Link
          href="/planning"
          className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-white"
        >
          <span className="flex-1">Mon planning</span>
          <ChevronRight className="h-4 w-4 text-slate-500" strokeWidth={1.8} aria-hidden />
        </Link>
        <Link
          href="/challenges"
          className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-white"
        >
          <span className="flex-1">Challenges</span>
          <ChevronRight className="h-4 w-4 text-slate-500" strokeWidth={1.8} aria-hidden />
        </Link>
      </div>

      <form action={signOut}>
        <button type="submit" className="btn-ghost w-full">
          Déconnexion
        </button>
      </form>
    </div>
  );
}

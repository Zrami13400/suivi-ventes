import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

const TABS = [
  { href: "/admin", label: "Vue d'ensemble" },
  { href: "/admin/objectifs", label: "Objectifs" },
  { href: "/admin/primes", label: "Règles de primes" },
  { href: "/admin/planning", label: "Planning" },
  { href: "/admin/challenges", label: "Challenges" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Administration</h1>
        <nav className="mt-4 flex flex-wrap gap-1 border-b border-line">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-t-md px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-surface-strong hover:text-white"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}

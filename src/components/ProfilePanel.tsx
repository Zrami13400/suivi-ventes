import Link from "next/link";
import { formatMoney, weekRange } from "@/lib/format";
import {
  actesParCategorie,
  primeParts,
  totalActes,
  type PriceBook,
  type RankRow,
} from "@/lib/kpi";
import { BADGES, type BadgeKey } from "@/lib/constants";
import type { PrimeJournaliere, Vente } from "@/lib/types";
import { Avatar } from "./ui";

interface Props {
  nomComplet: string;
  stats: RankRow | null;
  badges: BadgeKey[];
  primesJour: PrimeJournaliere[];
  weekVentes?: Vente[];
  priceBook: PriceBook;
}

export function ProfilePanel({
  nomComplet,
  stats,
  badges,
  primesJour,
  weekVentes = [],
  priceBook,
}: Props) {
  const { start, end } = weekRange();
  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);

  const weekPrime = primesJour
    .filter((p) => p.date >= s && p.date < e)
    .reduce((sum, p) => sum + Number(p.prime_calculee ?? 0), 0);

  const weekActes = totalActes(weekVentes);
  const cat = actesParCategorie(weekVentes);
  const parts = primeParts(weekVentes, priceBook);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <Avatar name={nomComplet} size={48} />
        <div>
          <p className="font-semibold text-white">{nomComplet}</p>
          <p className="text-xs text-slate-400">
            Vendeur · Niveau {stats?.niveau ?? 1}
            {stats?.niveauLabel ? ` (${stats.niveauLabel})` : ""}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-line bg-surface-strong p-3">
          <p className="text-xs text-slate-400">Cette semaine</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-white">
            {weekActes}{" "}
            <span className="text-xs font-normal text-slate-400">actes</span>
          </p>
        </div>
        <div className="rounded-lg border border-line bg-surface-strong p-3">
          <p className="text-xs text-slate-400">Primes semaine (base)</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-amber-300">
            {formatMoney(weekPrime)}
          </p>
        </div>
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        <Row label="Freebox" value={cat.freebox} />
        <Row label="Forfaits" value={cat.forfaits} />
        <Row label="Téléphones" value={cat.telephones} />
        <Row label="McAfee" value={formatMoney(parts.mcafee)} muted />
      </dl>

      {badges.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span
              key={b}
              title={BADGES[b].desc}
              className="chip bg-brand/15 text-brand-soft ring-1 ring-brand/25"
            >
              <span aria-hidden>{BADGES[b].emoji}</span>
              {BADGES[b].label}
            </span>
          ))}
        </div>
      )}

      <Link
        href="/profil"
        className="mt-4 inline-block text-sm font-medium text-brand-soft hover:underline"
      >
        Voir mon profil →
      </Link>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd
        className={`font-medium tabular-nums ${muted ? "text-slate-300" : "text-white"}`}
      >
        {value}
      </dd>
    </div>
  );
}

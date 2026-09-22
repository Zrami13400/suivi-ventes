"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { TREND_META, type RankRow } from "@/lib/kpi";
import { Avatar, ProgressBar, cx } from "../ui";

type SubTab = "equipe" | "objectifs" | "classement";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "equipe", label: "Mon équipe" },
  { key: "objectifs", label: "Objectifs" },
  { key: "classement", label: "Classement" },
];

export function EquipeTab({
  rows,
  targets,
  actesMoisPrecedent,
  selfId,
  canSeePrimes,
}: {
  rows: RankRow[];
  /** Objectif mensuel (nb d'actes) par vendeur, si connu. */
  targets: Record<string, number>;
  actesMoisPrecedent: Record<string, number>;
  selfId: string;
  canSeePrimes: boolean;
}) {
  const [sub, setSub] = useState<SubTab>("equipe");

  const top = rows[0];
  const topPrev = top ? actesMoisPrecedent[top.vendeur.id] ?? 0 : 0;
  const topGrowth =
    top && top.actes > 0 && topPrev > 0
      ? Math.round(((top.actes - topPrev) / topPrev) * 100)
      : null;

  return (
    <div className="space-y-5 pb-4">
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-surface-strong p-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSub(t.key)}
            className={cx(
              "flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium transition",
              sub === t.key ? "bg-rose-500 text-white" : "text-slate-400",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "equipe" && (
        <div className="card divide-y divide-line/60 p-0">
          {rows.map((r) => {
            const target = targets[r.vendeur.id] ?? 0;
            const p = target > 0 ? Math.min(100, Math.round((r.actes / target) * 100)) : 0;
            const t = TREND_META[r.statut];
            return (
              <div key={r.vendeur.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={r.vendeur.nom_complet} avatarUrl={r.vendeur.avatar_url} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-white">
                    {r.vendeur.nom_complet}
                    {r.vendeur.id === selfId && (
                      <span className="text-xs text-brand-soft">(moi)</span>
                    )}
                    <span title={t.label}>{t.emoji}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    Note {r.niveau}/5 · Objectif {target || "—"}
                  </p>
                  <div className="mt-1.5">
                    <ProgressBar value={p} tone="violet" />
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{p}%</span>
              </div>
            );
          })}
        </div>
      )}

      {sub === "objectifs" && (
        <div className="card divide-y divide-line/60 p-0">
          {rows.map((r) => (
            <div key={r.vendeur.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={r.vendeur.nom_complet} avatarUrl={r.vendeur.avatar_url} size={32} />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                  {r.vendeur.nom_complet}
                </p>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-surface-strong py-1.5">
                  <p className="font-semibold text-white">{r.parCategorie.freebox}</p>
                  <p className="text-slate-500">Freebox</p>
                </div>
                <div className="rounded-lg bg-surface-strong py-1.5">
                  <p className="font-semibold text-white">{r.parCategorie.forfaits}</p>
                  <p className="text-slate-500">Forfaits</p>
                </div>
                <div className="rounded-lg bg-surface-strong py-1.5">
                  <p className="font-semibold text-white">{r.parCategorie.telephones}</p>
                  <p className="text-slate-500">Téléphones</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {sub === "classement" && (
        <div className="card divide-y divide-line/60 p-0">
          {rows.map((r) => {
            const t = TREND_META[r.statut];
            return (
              <div key={r.vendeur.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-400">
                  {r.rang === 1 ? "👑" : r.rang}
                </span>
                <Avatar name={r.vendeur.nom_complet} avatarUrl={r.vendeur.avatar_url} size={32} />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                  {r.vendeur.nom_complet}
                </p>
                <span className="text-sm font-semibold tabular-nums text-white">{r.actes}</span>
                {canSeePrimes && (
                  <span className="text-xs tabular-nums text-amber-300">
                    {formatMoney(r.prime)}
                  </span>
                )}
                <span className={cx("text-sm", t.className)} title={t.label}>
                  {t.emoji}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {top && top.actes > 0 && (
        <div className="rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 p-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
            Top vendeur du mois
          </p>
          <p className="mt-1 text-lg font-bold">{top.vendeur.nom_complet}</p>
          {topGrowth != null && (
            <p className="text-sm opacity-90">
              {topGrowth > 0 ? "+" : ""}
              {topGrowth}% vs mois dernier
            </p>
          )}
        </div>
      )}
    </div>
  );
}

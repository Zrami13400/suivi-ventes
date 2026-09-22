"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import { CATEGORIES } from "@/lib/constants";
import type { Vente } from "@/lib/types";
import { cx } from "../ui";

type Periode = "semaine" | "mois" | "annee";

const PERIODES: { key: Periode; label: string }[] = [
  { key: "semaine", label: "Semaine" },
  { key: "mois", label: "Mois" },
  { key: "annee", label: "Année" },
];

function startOfWeek(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  const day = (c.getDay() + 6) % 7;
  c.setDate(c.getDate() - day);
  return c;
}

function windowFor(periode: Periode, ref: Date): { start: Date; prevStart: Date; prevEnd: Date } {
  if (periode === "semaine") {
    const start = startOfWeek(ref);
    const prevStart = new Date(start);
    prevStart.setDate(start.getDate() - 7);
    return { start, prevStart, prevEnd: start };
  }
  if (periode === "mois") {
    const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const prevStart = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
    return { start, prevStart, prevEnd: start };
  }
  const start = new Date(ref.getFullYear(), 0, 1);
  const prevStart = new Date(ref.getFullYear() - 1, 0, 1);
  return { start, prevStart, prevEnd: start };
}

function sumQty(ventes: Vente[], acte: string, from: Date, to: Date): number {
  const f = from.getTime();
  const t = to.getTime();
  return ventes.reduce((s, v) => {
    if (v.acte_type !== acte) return s;
    const ts = new Date(v.created_at).getTime();
    return ts >= f && ts < t ? s + v.quantity : s;
  }, 0);
}

export function StatsTab({
  sellerVentes,
  last7,
}: {
  /** Ventes du vendeur sur une fenêtre large (≥ 1 an), pour les comparaisons de période. */
  sellerVentes: Vente[];
  last7: { iso: string; prime: number }[];
}) {
  const [periode, setPeriode] = useState<Periode>("mois");

  const { start, prevStart, prevEnd } = useMemo(() => windowFor(periode, new Date()), [periode]);
  const now = useMemo(() => new Date(), []);

  const periodLabel =
    periode === "semaine" ? "semaine dernière" : periode === "mois" ? "mois dernier" : "année dernière";

  const rows = CATEGORIES.map((c) => {
    const current = sumQty(sellerVentes, c.acte, start, now);
    const previous = sumQty(sellerVentes, c.acte, prevStart, prevEnd);
    return { ...c, current, delta: current - previous };
  });

  const max7 = Math.max(1, ...last7.map((d) => d.prime));

  return (
    <div className="space-y-5 pb-4">
      <div className="flex gap-1 rounded-lg bg-surface-strong p-1">
        {PERIODES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriode(p.key)}
            className={cx(
              "flex-1 rounded-md py-1.5 text-sm font-medium transition",
              periode === p.key ? "bg-rose-500 text-white" : "text-slate-400",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {rows.map((r) => (
          <div key={r.key} className="card flex items-center gap-3 p-4">
            <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white", r.grad)}>
              {r.short.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{r.label}</p>
              <p className="text-xs text-slate-400">{r.current} actes</p>
            </div>
            <span
              className={cx(
                "flex items-center gap-1 text-xs font-semibold",
                r.delta > 0 ? "text-emerald-300" : r.delta < 0 ? "text-rose-300" : "text-slate-500",
              )}
            >
              {r.delta > 0 ? (
                <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              ) : r.delta < 0 ? (
                <TrendingDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              ) : null}
              {r.delta > 0 ? `+${r.delta}` : r.delta} vs {periodLabel}
            </span>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <p className="text-sm font-semibold text-white">Évolution de la prime estimée</p>
        <p className="text-xs text-slate-500">7 derniers jours</p>
        <div className="mt-3 flex items-end gap-2">
          {last7.map((d) => (
            <div key={d.iso} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-slate-400">
                {d.prime > 0 ? formatMoney(d.prime) : ""}
              </span>
              <div
                className="w-full rounded-t bg-gradient-to-t from-rose-500/40 to-rose-400"
                style={{ height: `${8 + (d.prime / max7) * 90}px` }}
              />
              <span className="text-[10px] text-slate-500">
                {new Date(d.iso).toLocaleDateString("fr-FR", { weekday: "short" })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

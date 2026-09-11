"use client";

import { useState, useTransition } from "react";
import { setPlanning } from "@/app/(app)/admin/actions";
import {
  PLANNING_CYCLE,
  PLANNING_META,
  PLANNING_STATUTS,
  type PlanningStatut,
} from "@/lib/constants";
import { joursDuMois } from "@/lib/planning";
import { cx } from "./ui";

interface Seller {
  id: string;
  nom_complet: string;
}

export default function PlanningGrid({
  mois,
  sellers,
  initialPlanning,
}: {
  mois: string;
  sellers: Seller[];
  initialPlanning: { vendeur_id: string; date: string; statut: PlanningStatut }[];
}) {
  const days = joursDuMois(mois);
  const [map, setMap] = useState<Map<string, PlanningStatut>>(
    () => new Map(initialPlanning.map((p) => [`${p.vendeur_id}|${p.date}`, p.statut])),
  );
  const [, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function cycle(vendeurId: string, date: string) {
    const k = `${vendeurId}|${date}`;
    const current = map.get(k) ?? null;
    const idx = PLANNING_CYCLE.indexOf(current);
    const next = PLANNING_CYCLE[(idx + 1) % PLANNING_CYCLE.length];

    setMap((prev) => {
      const copy = new Map(prev);
      if (next === null) copy.delete(k);
      else copy.set(k, next);
      return copy;
    });
    startTransition(() => {
      setPlanning(vendeurId, date, next);
    });
  }

  if (sellers.length === 0) {
    return (
      <p className="card p-5 text-sm text-slate-400">
        Aucun vendeur dans cette boutique.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        {PLANNING_STATUTS.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={cx("h-2.5 w-2.5 rounded-full", s.dot)} />
            {s.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-line" />
          Non renseigné
        </span>
      </div>

      <div className="card scrollbar-thin overflow-x-auto p-3">
        <table className="border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-2 text-left font-medium text-slate-400">
                Vendeur
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  className={cx(
                    "w-7 px-0 text-center font-medium text-slate-500",
                    d === today && "text-brand-soft",
                  )}
                >
                  {Number(d.slice(8, 10))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sellers.map((s) => (
              <tr key={s.id}>
                <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-2 py-1 font-medium text-white">
                  {s.nom_complet}
                </td>
                {days.map((d) => {
                  const statut = map.get(`${s.id}|${d}`);
                  const meta = statut ? PLANNING_META[statut] : null;
                  return (
                    <td key={d} className="p-0 text-center">
                      <button
                        type="button"
                        title={`${s.nom_complet} — ${d}${meta ? ` — ${meta.label}` : ""}`}
                        onClick={() => cycle(s.id, d)}
                        className={cx(
                          "grid h-7 w-7 place-items-center rounded-md border text-[10px] font-semibold transition",
                          meta
                            ? cx("border-transparent", meta.cell)
                            : "border-line/70 text-slate-600 hover:bg-surface-strong",
                          d === today && "ring-1 ring-brand/50",
                        )}
                      >
                        {meta?.court ?? ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Cliquez une cellule pour faire défiler : Présent → Absent → Congé →
        Maladie → Formation → (vide).
      </p>
    </div>
  );
}

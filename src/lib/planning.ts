import type { Planning, PlanningStatut } from "./types";

/** Liste des jours (AAAA-MM-JJ) d'un mois AAAA-MM. */
export function joursDuMois(mois: string): string[] {
  const [y, m] = mois.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from(
    { length: n },
    (_, i) => `${mois}-${String(i + 1).padStart(2, "0")}`,
  );
}

/** Nombre de jours "present" d'un vendeur sur un intervalle de dates inclus. */
export function joursTravailles(
  planning: Planning[],
  startISO: string,
  endISO: string,
): number {
  return planning.filter(
    (p) => p.statut === "present" && p.date >= startISO && p.date <= endISO,
  ).length;
}

/** Répartition des statuts sur une période. */
export function repartitionStatuts(
  planning: Planning[],
): Record<PlanningStatut, number> {
  const acc: Record<PlanningStatut, number> = {
    present: 0,
    absent: 0,
    conge: 0,
    maladie: 0,
    formation: 0,
  };
  for (const p of planning) acc[p.statut] = (acc[p.statut] ?? 0) + 1;
  return acc;
}

export function planningMap(planning: Planning[]): Map<string, PlanningStatut> {
  return new Map(planning.map((p) => [`${p.vendeur_id}|${p.date}`, p.statut]));
}

/**
 * Série de jours "present" consécutifs jusqu'à `todayISO` inclus. Un jour
 * sans entrée de planning n'arrête pas la série s'il s'agit d'aujourd'hui
 * (pas encore pointé) ; tout autre trou l'arrête.
 */
export function presenceStreak(planning: Planning[], todayISO: string): number {
  const statutByDate = new Map(planning.map((p) => [p.date, p.statut]));
  let streak = 0;
  const d = new Date(todayISO);
  for (let i = 0; i < 60; i++) {
    const iso = d.toISOString().slice(0, 10);
    if (statutByDate.get(iso) === "present") streak++;
    else if (i > 0) break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

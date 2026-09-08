import type { Challenge, ChallengeStatut, Profile, Vente } from "./types";

export function challengeStatut(
  c: Pick<Challenge, "date_debut" | "date_fin">,
  today: string = new Date().toISOString().slice(0, 10),
): ChallengeStatut {
  if (today < c.date_debut) return "a_venir";
  if (today > c.date_fin) return "termine";
  return "en_cours";
}

export const STATUT_META: Record<
  ChallengeStatut,
  { label: string; className: string }
> = {
  a_venir: { label: "À venir", className: "bg-sky-500/15 text-sky-200" },
  en_cours: { label: "En cours", className: "bg-emerald-500/15 text-emerald-200" },
  termine: { label: "Terminé", className: "bg-slate-600/30 text-slate-300" },
};

export interface Standing {
  vendeur: Profile | null;
  vendeurId: string;
  score: number;
}

/** Classement d'un challenge à partir des ventes de la boutique. */
export function challengeStandings(
  c: Challenge,
  ventes: Vente[],
  sellersById: Map<string, Profile>,
): Standing[] {
  const inRange = ventes.filter((v) => {
    const d = v.created_at.slice(0, 10);
    return d >= c.date_debut && d <= c.date_fin;
  });

  return c.participant_ids
    .map((id) => {
      const mine = inRange.filter((v) => v.vendeur_id === id);
      const score = mine.reduce(
        (s, v) =>
          s +
          (c.metrique === "actes" || v.acte_type === c.metrique ? v.quantity : 0),
        0,
      );
      return { vendeurId: id, vendeur: sellersById.get(id) ?? null, score };
    })
    .sort((a, b) => b.score - a.score);
}

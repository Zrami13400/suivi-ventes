// ------------------------------------------------------------------
// Calculs KPI dérivés des tables existantes (ventes, regles_primes,
// primes_journalieres, objectifs). Aucune donnée nouvelle : tout est
// recalculé à partir de `acte_type + quantity + has_mcafee + has_assurance`,
// exactement comme le trigger SQL `recalculer_prime()`.
// ------------------------------------------------------------------
import {
  BADGES,
  CATEGORIES,
  categoryForActe,
  niveauPourActes,
  prochainNiveau,
  type BadgeKey,
  type CategoryMeta,
} from "./constants";
import type { PrimeJournaliere, Profile, ReglePrime, Vente } from "./types";

export type CatKey = CategoryMeta["key"];

const emptyByCat = (): Record<CatKey, number> => ({
  freebox: 0,
  forfaits: 0,
  telephones: 0,
});

/** Commission d'une ligne de vente — miroir exact du trigger SQL. */
export function ligneCommission(v: Vente, r?: ReglePrime): number {
  const base = v.quantity * (r?.montant_par_acte ?? 0);
  const mca = v.has_mcafee ? v.quantity * (r?.bonus_mcafee ?? 0) : 0;
  const ass = v.has_assurance ? v.quantity * (r?.bonus_assurance ?? 0) : 0;
  return base + mca + ass;
}

export function reglesByActe(regles: ReglePrime[]): Map<string, ReglePrime> {
  return new Map(regles.map((r) => [r.acte_type, r]));
}

export interface PrimeParts {
  box: number;
  forfaits: number;
  telephones: number;
  mcafee: number;
  total: number;
}

/**
 * Ventile la prime d'un ensemble de ventes par catégorie. McAfee est isolé
 * (comme sur le tableau de bord de référence) ; l'assurance est rattachée
 * aux téléphones.
 */
export function primeParts(ventes: Vente[], regles: ReglePrime[]): PrimeParts {
  const byActe = reglesByActe(regles);
  const p: PrimeParts = { box: 0, forfaits: 0, telephones: 0, mcafee: 0, total: 0 };
  for (const v of ventes) {
    const r = byActe.get(v.acte_type);
    const base = v.quantity * (r?.montant_par_acte ?? 0);
    if (v.acte_type === "Freebox") {
      p.box += base;
      if (v.has_mcafee) p.mcafee += v.quantity * (r?.bonus_mcafee ?? 0);
    } else if (v.acte_type === "Forfait mobile") {
      p.forfaits += base;
    } else if (v.acte_type === "Téléphone") {
      p.telephones += base;
      if (v.has_assurance) p.telephones += v.quantity * (r?.bonus_assurance ?? 0);
    }
  }
  p.total = p.box + p.forfaits + p.telephones + p.mcafee;
  return p;
}

/** Chiffre d'affaires « commission » d'un ensemble de ventes. */
export function totalCommission(ventes: Vente[], regles: ReglePrime[]): number {
  const byActe = reglesByActe(regles);
  return ventes.reduce((s, v) => s + ligneCommission(v, byActe.get(v.acte_type)), 0);
}

export function actesParCategorie(ventes: Vente[]): Record<CatKey, number> {
  const acc = emptyByCat();
  for (const v of ventes) {
    const cat = categoryForActe(v.acte_type);
    if (cat) acc[cat.key] += v.quantity;
  }
  return acc;
}

export function totalActes(ventes: Vente[]): number {
  return ventes.reduce((s, v) => s + v.quantity, 0);
}

/** Répartition (fractions sommant à 1) des actes par catégorie. */
export function categoryMix(ventes: Vente[]): Record<CatKey, number> {
  const acc = actesParCategorie(ventes);
  const tot = acc.freebox + acc.forfaits + acc.telephones;
  if (tot <= 0) return { freebox: 0.3, forfaits: 0.45, telephones: 0.25 };
  return {
    freebox: acc.freebox / tot,
    forfaits: acc.forfaits / tot,
    telephones: acc.telephones / tot,
  };
}

/** Cible d'actes du jour par catégorie, dérivée d'une cible quotidienne. */
export function objectifJourParCategorie(
  cibleJour: number,
  mix: Record<CatKey, number>,
): Record<CatKey, number> {
  return {
    freebox: Math.round(cibleJour * mix.freebox),
    forfaits: Math.round(cibleJour * mix.forfaits),
    telephones: Math.round(cibleJour * mix.telephones),
  };
}

// ------------------------------------------------------------------
// Statistiques par vendeur sur une période (mois en général).
// ------------------------------------------------------------------
export type TrendStatut = "top" | "up" | "stable" | "down";

export const TREND_META: Record<
  TrendStatut,
  { emoji: string; label: string; className: string }
> = {
  top: { emoji: "🔥", label: "En tête", className: "text-amber-300" },
  up: { emoji: "↑", label: "En progression", className: "text-emerald-300" },
  stable: { emoji: "→", label: "Stable", className: "text-slate-400" },
  down: { emoji: "↓", label: "En baisse", className: "text-rose-300" },
};

export interface SellerStats {
  vendeur: Profile;
  actes: number;
  parCategorie: Record<CatKey, number>;
  mcafee: number;
  assurance: number;
  optionsRate: number; // options / actes éligibles
  joursActifs: number;
  prime: number; // 0 si non visible pour l'appelant
  niveau: number;
  niveauLabel: string;
  prochainSeuil: number | null;
}

export function computeSellerStats(
  vendeur: Profile,
  ventes: Vente[], // ventes de CE vendeur sur la période
  primeRows: PrimeJournaliere[], // primes_journalieres de CE vendeur sur la période (peut être vide)
): SellerStats {
  const actes = totalActes(ventes);
  const parCategorie = actesParCategorie(ventes);
  let mcafee = 0;
  let assurance = 0;
  let eligibles = 0;
  const jours = new Set<string>();
  for (const v of ventes) {
    jours.add(v.created_at.slice(0, 10));
    if (v.acte_type === "Freebox") {
      eligibles += v.quantity;
      if (v.has_mcafee) mcafee += v.quantity;
    }
    if (v.acte_type === "Téléphone") {
      eligibles += v.quantity;
      if (v.has_assurance) assurance += v.quantity;
    }
  }
  const prime = primeRows.reduce((s, p) => s + Number(p.prime_calculee ?? 0), 0);
  const n = niveauPourActes(actes);
  const suiv = prochainNiveau(actes);
  return {
    vendeur,
    actes,
    parCategorie,
    mcafee,
    assurance,
    optionsRate: eligibles > 0 ? (mcafee + assurance) / eligibles : 0,
    joursActifs: jours.size,
    prime,
    niveau: n.niveau,
    niveauLabel: n.label,
    prochainSeuil: suiv?.min ?? null,
  };
}

/** Tendance d'un vendeur : compare la 2ᵉ moitié de période à la 1ʳᵉ. */
export function trend(ventes: Vente[], start: string, end: string): TrendStatut {
  const t0 = Date.parse(start);
  const t1 = Date.parse(end);
  const mid = t0 + (t1 - t0) / 2;
  let a = 0;
  let b = 0;
  for (const v of ventes) {
    const t = Date.parse(v.created_at);
    if (t < mid) a += v.quantity;
    else b += v.quantity;
  }
  if (b > a * 1.1) return "up";
  if (b < a * 0.9) return "down";
  return "stable";
}

export interface RankRow extends SellerStats {
  rang: number;
  statut: TrendStatut;
}

/**
 * Classement de tous les vendeurs par nombre d'actes.
 * @param ventesByVendeur ventes de la période groupées par vendeur_id
 * @param primesByVendeur primes_journalieres de la période groupées par vendeur_id
 */
export function buildRanking(
  vendeurs: Profile[],
  ventesByVendeur: Map<string, Vente[]>,
  primesByVendeur: Map<string, PrimeJournaliere[]>,
  start: string,
  end: string,
): RankRow[] {
  const stats = vendeurs.map((v) =>
    computeSellerStats(
      v,
      ventesByVendeur.get(v.id) ?? [],
      primesByVendeur.get(v.id) ?? [],
    ),
  );
  stats.sort((x, y) => y.actes - x.actes || y.prime - x.prime);
  return stats.map((s, i) => ({
    ...s,
    rang: i + 1,
    statut:
      i === 0 && s.actes > 0
        ? "top"
        : trend(ventesByVendeur.get(s.vendeur.id) ?? [], start, end),
  }));
}

// ------------------------------------------------------------------
// Badges du mois.
// ------------------------------------------------------------------
export function computeBadges(
  ranking: RankRow[],
  actesMoisPrecedent: Map<string, number>,
): Map<string, BadgeKey[]> {
  const out = new Map<string, BadgeKey[]>();
  const add = (id: string, b: BadgeKey) => {
    const arr = out.get(id) ?? [];
    arr.push(b);
    out.set(id, arr);
  };
  const withActs = ranking.filter((r) => r.actes > 0);
  if (withActs.length === 0) return out;

  const max = <T,>(arr: T[], f: (t: T) => number) =>
    arr.reduce((best, cur) => (f(cur) > f(best) ? cur : best), arr[0]);

  const topBox = max(withActs, (r) => r.parCategorie.freebox);
  if (topBox.parCategorie.freebox > 0) add(topBox.vendeur.id, "top_box");

  const crossSell = max(
    withActs.filter((r) => r.mcafee + r.assurance > 0),
    (r) => r.optionsRate,
  );
  if (crossSell) add(crossSell.vendeur.id, "cross_sell");

  const serieux = max(withActs, (r) => r.joursActifs);
  if (serieux.joursActifs > 0) add(serieux.vendeur.id, "serieux");

  for (const r of withActs) {
    const c = r.parCategorie;
    if (c.freebox > 0 && c.forfaits > 0 && c.telephones > 0)
      add(r.vendeur.id, "esprit_equipe");
  }

  let bestProg: { id: string; delta: number } | null = null;
  for (const r of withActs) {
    const delta = r.actes - (actesMoisPrecedent.get(r.vendeur.id) ?? 0);
    if (delta > 0 && (!bestProg || delta > bestProg.delta))
      bestProg = { id: r.vendeur.id, delta };
  }
  if (bestProg) add(bestProg.id, "progression");

  return out;
}

export { BADGES, CATEGORIES, niveauPourActes, prochainNiveau };

// ------------------------------------------------------------------
// Objectif « boutique » du jour.
// ------------------------------------------------------------------
export interface ObjectifLike {
  vendeur_id: string | null;
  periode: string;
  date_debut: string;
  date_fin: string;
  nb_ventes_cible: number;
}

/**
 * Cible d'actes de la boutique pour aujourd'hui : on prend un objectif
 * « jour » boutique s'il couvre la date, sinon on répartit un objectif
 * « mois » boutique sur les jours restants du mois.
 */
export function objectifBoutiqueJour(
  objectifs: ObjectifLike[],
  today: string = new Date().toISOString().slice(0, 10),
): number {
  const boutique = objectifs.filter((o) => o.vendeur_id === null);
  const jour = boutique.find(
    (o) =>
      o.periode === "jour" && o.date_debut <= today && o.date_fin >= today,
  );
  if (jour) return jour.nb_ventes_cible;

  const semaine = boutique.find(
    (o) =>
      o.periode === "semaine" && o.date_debut <= today && o.date_fin >= today,
  );
  if (semaine) return Math.ceil(semaine.nb_ventes_cible / 6);

  const mois = boutique.find(
    (o) => o.periode === "mois" && o.date_debut <= today && o.date_fin >= today,
  );
  if (mois) {
    const joursOuvres = 26; // approximation (boutique ouverte ~6j/7)
    return Math.max(1, Math.round(mois.nb_ventes_cible / joursOuvres));
  }
  return 0;
}

/** Cible d'actes du jour pour un vendeur donné. */
export function objectifJourVendeur(
  objectifs: ObjectifLike[],
  vendeurId: string,
  today: string = new Date().toISOString().slice(0, 10),
): number {
  const perso = objectifs.filter((o) => o.vendeur_id === vendeurId);
  const jour = perso.find(
    (o) => o.periode === "jour" && o.date_debut <= today && o.date_fin >= today,
  );
  if (jour) return jour.nb_ventes_cible;
  const semaine = perso.find(
    (o) =>
      o.periode === "semaine" && o.date_debut <= today && o.date_fin >= today,
  );
  if (semaine) return Math.ceil(semaine.nb_ventes_cible / 6);
  const mois = perso.find(
    (o) => o.periode === "mois" && o.date_debut <= today && o.date_fin >= today,
  );
  if (mois) return Math.max(1, Math.round(mois.nb_ventes_cible / 22));
  return 0;
}

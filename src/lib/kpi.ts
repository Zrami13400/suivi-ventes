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
import type {
  ModeleTelephone,
  PalierPrime,
  Profile,
  ReglePrime,
  SousTypeActe,
  Vente,
} from "./types";

export type CatKey = CategoryMeta["key"];

const emptyByCat = (): Record<CatKey, number> => ({
  freebox: 0,
  forfaits: 0,
  telephones: 0,
});

const MAIN_ACTES = ["Freebox", "Forfait mobile", "Téléphone"] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------
// Barème : montant de base d'une ligne de vente.
// Priorité au sous-type vendu, repli sur regles_primes.montant_par_acte.
// Miroir de `coalesce(st.montant_base, rp.montant_par_acte, 0)` du trigger.
// ------------------------------------------------------------------
export interface PriceBook {
  sousTypes: Map<string, SousTypeActe>;
  modeles: Map<string, ModeleTelephone>;
  regles: Map<string, ReglePrime>;
}

export function priceBook(
  sousTypes: SousTypeActe[],
  regles: ReglePrime[],
  modeles: ModeleTelephone[] = [],
): PriceBook {
  return {
    sousTypes: new Map(sousTypes.map((s) => [s.id, s])),
    modeles: new Map(modeles.map((m) => [m.id, m])),
    regles: new Map(regles.map((r) => [r.acte_type, r])),
  };
}

export function reglesByActe(regles: ReglePrime[]): Map<string, ReglePrime> {
  return new Map(regles.map((r) => [r.acte_type, r]));
}

/** Montant de base € pour une ligne de vente (hors bonus, hors boosts). */
export function venteBase(v: Vente, pb: PriceBook): number {
  const modele = v.modele_id ? pb.modeles.get(v.modele_id) : undefined;
  const st = v.sous_type_id ? pb.sousTypes.get(v.sous_type_id) : undefined;
  const base =
    modele?.montant_base ??
    st?.montant_base ??
    pb.regles.get(v.acte_type)?.montant_par_acte ??
    0;
  return v.quantity * base;
}

/** Prime "flat" d'une ligne : base + bonus options (sans les boosts mensuels). */
export function ligneCommission(v: Vente, pb: PriceBook): number {
  const r = pb.regles.get(v.acte_type);
  const mca = v.has_mcafee ? v.quantity * (r?.bonus_mcafee ?? 0) : 0;
  const ass = v.has_assurance ? v.quantity * (r?.bonus_assurance ?? 0) : 0;
  const coq = v.has_coque ? v.quantity * (r?.bonus_coque ?? 0) : 0;
  const rep = v.has_reprise ? v.quantity * (r?.bonus_reprise ?? 0) : 0;
  const gar = v.has_garantie ? v.quantity * (r?.bonus_garantie ?? 0) : 0;
  return venteBase(v, pb) + mca + ass + coq + rep + gar;
}

export interface PrimeParts {
  box: number;
  forfaits: number;
  telephones: number;
  mcafee: number;
  total: number;
}

/**
 * Ventile la prime "flat" d'un ensemble de ventes par catégorie. McAfee est
 * isolé ; l'assurance est rattachée aux téléphones.
 */
export function primeParts(ventes: Vente[], pb: PriceBook): PrimeParts {
  const p: PrimeParts = { box: 0, forfaits: 0, telephones: 0, mcafee: 0, total: 0 };
  for (const v of ventes) {
    const r = pb.regles.get(v.acte_type);
    const base = venteBase(v, pb);
    if (v.acte_type === "Freebox") {
      p.box += base;
      if (v.has_mcafee) p.mcafee += v.quantity * (r?.bonus_mcafee ?? 0);
    } else if (v.acte_type === "Forfait mobile") {
      p.forfaits += base;
    } else if (v.acte_type === "Téléphone") {
      p.telephones += base;
      if (v.has_assurance) p.telephones += v.quantity * (r?.bonus_assurance ?? 0);
      if (v.has_coque) p.telephones += v.quantity * (r?.bonus_coque ?? 0);
      if (v.has_reprise) p.telephones += v.quantity * (r?.bonus_reprise ?? 0);
      if (v.has_garantie) p.telephones += v.quantity * (r?.bonus_garantie ?? 0);
    }
  }
  p.total = p.box + p.forfaits + p.telephones + p.mcafee;
  return p;
}

/** Chiffre d'affaires « commission » (flat) d'un ensemble de ventes. */
export function totalCommission(ventes: Vente[], pb: PriceBook): number {
  return ventes.reduce((s, v) => s + ligneCommission(v, pb), 0);
}

// ------------------------------------------------------------------
// Commission mensuelle complète — miroir de recalculer_primes_mois().
// Utilisé pour l'estimation temps réel côté client.
// ------------------------------------------------------------------
export interface CommissionBreakdown {
  base: number;
  boostIndividuel: number;
  boostCollectif: number;
  bonusMcafee: number;
  bonusAssurance: number;
  bonusCoque: number;
  bonusReprise: number;
  bonusGarantie: number;
  total: number;
  totalActes: number;
}

export interface CommissionConfig {
  priceBook: PriceBook;
  regles: ReglePrime[];
  paliers: PalierPrime[];
  /** Objectif volume boutique du mois par type d'acte. */
  objectifsBoutiqueMois: Partial<Record<string, number>>;
}

export function computeCommission(
  sellerVentesMois: Vente[],
  shopVentesMois: Vente[],
  cfg: CommissionConfig,
): CommissionBreakdown {
  const pb = cfg.priceBook;
  const paliersByActe = new Map(cfg.paliers.map((p) => [p.acte_type, p]));
  const reglesMap = new Map(cfg.regles.map((r) => [r.acte_type, r]));

  const qtyBy = (ventes: Vente[], acte: string) =>
    ventes.reduce((s, v) => (v.acte_type === acte ? s + v.quantity : s), 0);

  let base = 0;
  let totalActes = 0;
  for (const v of sellerVentesMois) {
    base += venteBase(v, pb);
    totalActes += v.quantity;
  }

  let boostIndividuel = 0;
  let boostCollectif = 0;
  for (const acte of MAIN_ACTES) {
    const pal = paliersByActe.get(acte);
    if (!pal) continue;
    const sellerQte = qtyBy(sellerVentesMois, acte);
    boostIndividuel +=
      Math.max(sellerQte - (pal.seuil_individuel ?? 0), 0) *
      (pal.boost_individuel ?? 0);

    const cible = cfg.objectifsBoutiqueMois[acte];
    const shopQte = qtyBy(shopVentesMois, acte);
    if (cible != null && shopQte > cible && (pal.boost_collectif ?? 0) > 0) {
      boostCollectif += Math.ceil((pal.boost_collectif ?? 0) * sellerQte);
    }
  }

  const rF = reglesMap.get("Freebox");
  const rT = reglesMap.get("Téléphone");
  const mcafeeQte = sellerVentesMois.reduce(
    (s, v) => (v.acte_type === "Freebox" && v.has_mcafee ? s + v.quantity : s),
    0,
  );
  const assuranceQte = sellerVentesMois.reduce(
    (s, v) => (v.acte_type === "Téléphone" && v.has_assurance ? s + v.quantity : s),
    0,
  );
  const coqueQte = sellerVentesMois.reduce(
    (s, v) => (v.acte_type === "Téléphone" && v.has_coque ? s + v.quantity : s),
    0,
  );
  const repriseQte = sellerVentesMois.reduce(
    (s, v) => (v.acte_type === "Téléphone" && v.has_reprise ? s + v.quantity : s),
    0,
  );
  const garantieQte = sellerVentesMois.reduce(
    (s, v) => (v.acte_type === "Téléphone" && v.has_garantie ? s + v.quantity : s),
    0,
  );
  const bonusMcafee = mcafeeQte * (rF?.bonus_mcafee ?? 0);
  const bonusAssurance = assuranceQte * (rT?.bonus_assurance ?? 0);
  const bonusCoque = coqueQte * (rT?.bonus_coque ?? 0);
  const bonusReprise = repriseQte * (rT?.bonus_reprise ?? 0);
  const bonusGarantie = garantieQte * (rT?.bonus_garantie ?? 0);

  return {
    base: round2(base),
    boostIndividuel: round2(boostIndividuel),
    boostCollectif: round2(boostCollectif),
    bonusMcafee: round2(bonusMcafee),
    bonusAssurance: round2(bonusAssurance),
    bonusCoque: round2(bonusCoque),
    bonusReprise: round2(bonusReprise),
    bonusGarantie: round2(bonusGarantie),
    total: round2(
      base +
        boostIndividuel +
        boostCollectif +
        bonusMcafee +
        bonusAssurance +
        bonusCoque +
        bonusReprise +
        bonusGarantie,
    ),
    totalActes,
  };
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
  prime: number, // prime mensuelle totale (0 si non visible pour l'appelant)
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
 * @param primeByVendeur prime_totale (primes_mensuelles) du mois, par vendeur_id
 */
export function buildRanking(
  vendeurs: Profile[],
  ventesByVendeur: Map<string, Vente[]>,
  primeByVendeur: Map<string, number>,
  start: string,
  end: string,
): RankRow[] {
  const stats = vendeurs.map((v) =>
    computeSellerStats(
      v,
      ventesByVendeur.get(v.id) ?? [],
      primeByVendeur.get(v.id) ?? 0,
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
// Objectifs — sélection, repli boutique et proratisation.
// ------------------------------------------------------------------
export interface ObjectifLike {
  vendeur_id: string | null;
  periode: string;
  date_debut: string;
  date_fin: string;
  acte_type: string | null;
  type_cible: string;
  valeur_cible: number | null;
  nb_ventes_cible?: number | null;
}

function cible(o: ObjectifLike): number {
  return Number(o.valeur_cible ?? o.nb_ventes_cible ?? 0);
}

function couvre(o: ObjectifLike, day: string): boolean {
  return o.date_debut <= day && o.date_fin >= day;
}

const PERIODE_JOURS: Record<string, number> = { jour: 1, semaine: 6, mois: 26 };

/** Rapporte une cible de période à une cible journalière. */
function parJour(o: ObjectifLike, joursTravailles?: number | null): number {
  const v = cible(o);
  if (o.periode === "jour") return v;
  const diviseur =
    joursTravailles && joursTravailles > 0
      ? joursTravailles
      : PERIODE_JOURS[o.periode] ?? 26;
  return v / diviseur;
}

/**
 * Objectif volume d'un vendeur (ou de la boutique si vendeurId absent) pour un
 * type d'acte, avec repli sur l'objectif boutique quand aucun objectif
 * individuel n'existe. Retourne la cible ramenée au jour.
 */
export function objectifVolumeJour(
  objectifs: ObjectifLike[],
  acteType: string,
  today: string,
  opts: { vendeurId?: string | null; joursTravailles?: number | null } = {},
): number {
  const vol = objectifs.filter(
    (o) => o.type_cible === "volume" && couvre(o, today),
  );
  // Uniquement le type d'acte exact : un objectif global (acte_type null) ne
  // doit pas être compté une fois par type sous peine de triple comptage —
  // il est traité séparément en repli (voir objectifBoutiqueJour).
  const forActe = (list: ObjectifLike[]) =>
    list.filter((o) => o.acte_type === acteType);

  const pickBest = (list: ObjectifLike[]): ObjectifLike | undefined =>
    ["jour", "semaine", "mois"]
      .map((p) => list.find((o) => o.periode === p))
      .find(Boolean);

  if (opts.vendeurId) {
    const perso = pickBest(forActe(vol.filter((o) => o.vendeur_id === opts.vendeurId)));
    if (perso) return parJour(perso, opts.joursTravailles);
  }
  const boutique = pickBest(forActe(vol.filter((o) => o.vendeur_id === null)));
  return boutique ? parJour(boutique) : 0;
}

/** Cible d'actes de la boutique aujourd'hui (somme des 3 types + objectif global). */
export function objectifBoutiqueJour(
  objectifs: ObjectifLike[],
  today: string = new Date().toISOString().slice(0, 10),
): number {
  const total =
    objectifVolumeJour(objectifs, "Freebox", today) +
    objectifVolumeJour(objectifs, "Forfait mobile", today) +
    objectifVolumeJour(objectifs, "Téléphone", today);
  if (total > 0) return Math.round(total);

  // Repli : ancien objectif global (acte_type null).
  const global = objectifs.find(
    (o) =>
      o.vendeur_id === null &&
      o.acte_type === null &&
      o.type_cible === "volume" &&
      couvre(o, today),
  );
  return global ? Math.round(parJour(global)) : 0;
}

/** Cible d'actes totale du jour pour un vendeur (tous types confondus). */
export function objectifJourVendeur(
  objectifs: ObjectifLike[],
  vendeurId: string,
  today: string = new Date().toISOString().slice(0, 10),
  joursTravailles?: number | null,
): number {
  const total = ["Freebox", "Forfait mobile", "Téléphone"].reduce(
    (s, acte) =>
      s +
      objectifVolumeJour(objectifs, acte, today, { vendeurId, joursTravailles }),
    0,
  );
  if (total > 0) return Math.round(total);

  // Repli : ancien objectif global individuel (acte_type null).
  const global = objectifs.find(
    (o) =>
      o.vendeur_id === vendeurId &&
      o.acte_type === null &&
      o.type_cible === "volume" &&
      couvre(o, today),
  );
  return global ? Math.round(parJour(global, joursTravailles)) : 0;
}

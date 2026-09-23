// ------------------------------------------------------------------
// Calculs KPI dérivés des tables existantes (ventes, regles_primes,
// primes_journalieres, objectifs). Aucune donnée nouvelle : tout est
// recalculé à partir de `acte_type + quantity + options (+ has_* historiques)`,
// exactement comme les fonctions SQL `recalculer_prime_jour/_mois()`.
// ------------------------------------------------------------------
import {
  ACTE_TYPES,
  BADGES,
  CATEGORIES,
  categoryForActe,
  isActeType,
  niveauPourActes,
  prochainNiveau,
  type ActeType,
  type BadgeKey,
  type CategoryMeta,
} from "./constants";
import { joursOuverts, joursTravailles } from "./planning";
import type {
  ModeleTelephone,
  OptionBonusDetail,
  OptionFlat,
  OptionLegacyKey,
  PalierPrime,
  Planning,
  PrimeMensuelle,
  Profile,
  ReglePrime,
  SousTypeActe,
  Vente,
} from "./types";

/** Un modèle est proposable s'il est actif et, si borné, pas encore expiré. */
export function isModeleUtilisable(m: ModeleTelephone): boolean {
  if (!m.actif) return false;
  if (m.mois_validite == null) return true;
  const expiry =
    new Date(m.updated_at).getTime() + m.mois_validite * 30 * 24 * 60 * 60 * 1000;
  return Date.now() < expiry;
}

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
// Priorité au modèle / sous-type vendu, repli sur regles_primes.montant_par_acte.
// Miroir de `coalesce(mt.montant_base, st.montant_base, rp.montant_par_acte, 0)`.
// ------------------------------------------------------------------
export interface PriceBook {
  sousTypes: Map<string, SousTypeActe>;
  modeles: Map<string, ModeleTelephone>;
  regles: Map<string, ReglePrime>;
  /** Options flat de la boutique (actives ou non), triées par ordre. */
  options: OptionFlat[];
}

const LEGACY_OPTIONS: {
  key: OptionLegacyKey;
  nom: string;
  acte: ActeType;
  col: keyof ReglePrime;
}[] = [
  { key: "mcafee", nom: "McAfee", acte: "Freebox", col: "bonus_mcafee" },
  { key: "assurance", nom: "Assurance mobile", acte: "Téléphone", col: "bonus_assurance" },
  { key: "coque", nom: "Coque", acte: "Téléphone", col: "bonus_coque" },
  { key: "reprise", nom: "Reprise", acte: "Téléphone", col: "bonus_reprise" },
  { key: "garantie", nom: "Garantie", acte: "Téléphone", col: "bonus_garantie" },
];

/**
 * Repli tant que la migration 007 (table options_flat) n'est pas exécutée :
 * reconstitue les 5 options historiques depuis les colonnes regles_primes.
 */
function legacyOptions(regles: ReglePrime[]): OptionFlat[] {
  return LEGACY_OPTIONS.map((o, i) => {
    const r = regles.find((x) => x.acte_type === o.acte);
    return {
      id: `legacy-${o.key}`,
      shop_id: r?.shop_id ?? "",
      nom: o.nom,
      acte_type: o.acte,
      montant_bonus: Number(r?.[o.col] ?? 0),
      actif: true,
      ordre: i,
      legacy_key: o.key,
      created_at: "",
    };
  });
}

/**
 * `options` à null = table options_flat absente (migration 007 non
 * exécutée) : repli sur les bonus figés de regles_primes.
 */
export function priceBook(
  sousTypes: SousTypeActe[],
  regles: ReglePrime[],
  modeles: ModeleTelephone[] = [],
  options: OptionFlat[] | null = null,
): PriceBook {
  return {
    sousTypes: new Map(sousTypes.map((s) => [s.id, s])),
    modeles: new Map(modeles.map((m) => [m.id, m])),
    regles: new Map(regles.map((r) => [r.acte_type, r])),
    options: sortOptions(options ?? legacyOptions(regles)),
  };
}

export function sortOptions(options: OptionFlat[]): OptionFlat[] {
  return [...options].sort(
    (a, b) =>
      a.acte_type.localeCompare(b.acte_type) ||
      a.ordre - b.ordre ||
      a.nom.localeCompare(b.nom),
  );
}

/** Options proposables à la saisie pour un type d'acte. */
export function optionsActives(pb: PriceBook, acte: string): OptionFlat[] {
  return pb.options.filter((o) => o.actif && o.acte_type === acte);
}

/** Bonus unitaire de l'option historique `key` (0 si supprimée). */
export function bonusOptionLegacy(pb: PriceBook, key: OptionLegacyKey): number {
  return Number(pb.options.find((o) => o.legacy_key === key)?.montant_bonus ?? 0);
}

const LEGACY_FLAG: Record<OptionLegacyKey, keyof Vente> = {
  mcafee: "has_mcafee",
  assurance: "has_assurance",
  coque: "has_coque",
  reprise: "has_reprise",
  garantie: "has_garantie",
};

/**
 * Options cochées sur une vente — miroir de la fonction SQL option_cochee() :
 * id présent dans ventes.options, ou booléen has_<legacy_key> vrai.
 */
export function optionsCochees(v: Vente, pb: PriceBook): OptionFlat[] {
  const ids = new Set(Array.isArray(v.options) ? v.options : []);
  return pb.options.filter(
    (o) =>
      o.acte_type === v.acte_type &&
      (ids.has(o.id) ||
        (o.legacy_key != null && v[LEGACY_FLAG[o.legacy_key]] === true)),
  );
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

/** Bonus options € d'une ligne de vente. */
export function venteBonusOptions(v: Vente, pb: PriceBook): number {
  return optionsCochees(v, pb).reduce(
    (s, o) => s + v.quantity * Number(o.montant_bonus ?? 0),
    0,
  );
}

/** Prime "flat" d'une ligne : base + bonus options (sans les boosts mensuels). */
export function ligneCommission(v: Vente, pb: PriceBook): number {
  return venteBase(v, pb) + venteBonusOptions(v, pb);
}

export interface PrimeParts {
  box: number;
  forfaits: number;
  telephones: number;
  total: number;
}

/**
 * Ventile la prime "flat" d'un ensemble de ventes par catégorie, bonus
 * options compris (rattachés au type d'acte de la vente).
 */
export function primeParts(ventes: Vente[], pb: PriceBook): PrimeParts {
  const p: PrimeParts = { box: 0, forfaits: 0, telephones: 0, total: 0 };
  for (const v of ventes) {
    const m = ligneCommission(v, pb);
    if (v.acte_type === "Freebox") p.box += m;
    else if (v.acte_type === "Forfait mobile") p.forfaits += m;
    else if (v.acte_type === "Téléphone") p.telephones += m;
  }
  p.total = p.box + p.forfaits + p.telephones;
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
  /** Total des bonus options. */
  bonusOptions: number;
  /** Ventilation par option cochée au moins une fois. */
  optionsDetail: OptionBonusDetail[];
  total: number;
  totalActes: number;
}

export interface CommissionConfig {
  priceBook: PriceBook;
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

  const qtyBy = (ventes: Vente[], acte: string) =>
    ventes.reduce((s, v) => (v.acte_type === acte ? s + v.quantity : s), 0);

  let base = 0;
  let totalActes = 0;
  const detail = new Map<string, OptionBonusDetail>();
  for (const v of sellerVentesMois) {
    base += venteBase(v, pb);
    totalActes += v.quantity;
    for (const o of optionsCochees(v, pb)) {
      const d = detail.get(o.id) ?? {
        id: o.id,
        nom: o.nom,
        acte_type: o.acte_type,
        qte: 0,
        montant: 0,
      };
      d.qte += v.quantity;
      d.montant += v.quantity * Number(o.montant_bonus ?? 0);
      detail.set(o.id, d);
    }
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

  // Même ordre que pb.options (type d'acte, puis ordre admin).
  const rank = new Map(pb.options.map((o, i) => [o.id, i]));
  const optionsDetail = Array.from(detail.values())
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    .map((d) => ({ ...d, montant: round2(d.montant) }));
  const bonusOptions = optionsDetail.reduce((s, d) => s + d.montant, 0);

  return {
    base: round2(base),
    boostIndividuel: round2(boostIndividuel),
    boostCollectif: round2(boostCollectif),
    bonusOptions: round2(bonusOptions),
    optionsDetail,
    total: round2(base + boostIndividuel + boostCollectif + bonusOptions),
    totalActes,
  };
}

/**
 * Ventilation stockée (primes_mensuelles) → CommissionBreakdown. Avant la
 * migration 007, reconstitue le détail depuis les colonnes bonus_* figées.
 */
export function breakdownFromPrimeMensuelle(pm: PrimeMensuelle): CommissionBreakdown {
  let optionsDetail: OptionBonusDetail[];
  if (Array.isArray(pm.bonus_options_detail)) {
    optionsDetail = pm.bonus_options_detail.map((d) => ({
      ...d,
      qte: Number(d.qte ?? 0),
      montant: Number(d.montant ?? 0),
    }));
  } else {
    optionsDetail = LEGACY_OPTIONS.map((o) => ({
      id: `legacy-${o.key}`,
      nom: o.nom,
      acte_type: o.acte as string,
      qte: 0,
      montant: Number(pm[`bonus_${o.key}` as keyof PrimeMensuelle] ?? 0),
    })).filter((d) => d.montant !== 0);
  }
  const bonusOptions =
    pm.bonus_options != null
      ? Number(pm.bonus_options)
      : round2(optionsDetail.reduce((s, d) => s + d.montant, 0));
  return {
    base: Number(pm.prime_base ?? 0),
    boostIndividuel: Number(pm.boost_individuel ?? 0),
    boostCollectif: Number(pm.boost_collectif ?? 0),
    bonusOptions,
    optionsDetail,
    total: Number(pm.prime_totale ?? 0),
    totalActes: Number(pm.total_actes ?? 0),
  };
}

// ------------------------------------------------------------------
// Présélections pour la saisie rapide (bottom sheet Accueil) : sous-produit
// et type d'acte les plus vendus par ce vendeur, pour confirmer une vente
// classique en deux taps.
// ------------------------------------------------------------------

/** Sous-produit (ou modèle Téléphone) le plus vendu par ce vendeur pour un type d'acte donné. */
export function mostFrequentSubProduct(
  ventes: Vente[],
  acteType: ActeType,
): { sousTypeId: string | null; modeleId: string | null } {
  const isTelephone = acteType === "Téléphone";
  const counts = new Map<string, number>();
  for (const v of ventes) {
    if (v.acte_type !== acteType) continue;
    const key = isTelephone ? v.modele_id : v.sous_type_id;
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + v.quantity);
  }
  let bestKey: string | null = null;
  let bestCount = 0;
  counts.forEach((c, k) => {
    if (c > bestCount) {
      bestKey = k;
      bestCount = c;
    }
  });
  return isTelephone
    ? { sousTypeId: null, modeleId: bestKey }
    : { sousTypeId: bestKey, modeleId: null };
}

/** Type d'acte le plus vendu par ce vendeur (repli sur "Freebox" si aucune vente). */
export function mostFrequentActeType(ventes: Vente[]): ActeType {
  const counts = new Map<ActeType, number>();
  for (const v of ventes) {
    if (!isActeType(v.acte_type)) continue;
    counts.set(v.acte_type, (counts.get(v.acte_type) ?? 0) + v.quantity);
  }
  let best: ActeType = ACTE_TYPES[0];
  let bestCount = -1;
  for (const acte of ACTE_TYPES) {
    const c = counts.get(acte) ?? 0;
    if (c > bestCount) {
      best = acte;
      bestCount = c;
    }
  }
  return best;
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

/**
 * Taux d'attachement d'une option (McAfee vs Freebox, Assurance vs
 * Téléphone) — même règle que la vue progression_objectifs.
 */
export function tauxAttachement(
  ventes: Vente[],
  option: "McAfee" | "Assurance",
): { attaches: number; base: number; taux: number } {
  const parent = option === "McAfee" ? "Freebox" : "Téléphone";
  const flag: keyof Vente = option === "McAfee" ? "has_mcafee" : "has_assurance";
  let attaches = 0;
  let base = 0;
  for (const v of ventes) {
    if (v.acte_type !== parent) continue;
    base += v.quantity;
    if (v[flag] === true) attaches += v.quantity;
  }
  return { attaches, base, taux: base > 0 ? Math.round((attaches / base) * 100) : 0 };
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

/** Planning servant à ramener un objectif de période au jour. */
export interface PlanningObjectifs {
  /** Planning du vendeur (objectifs individuels). */
  vendeur?: Planning[] | null;
  /** Planning de toute la boutique, tous vendeurs (objectifs boutique). */
  boutique?: Pick<Planning, "date" | "statut">[] | null;
}

/**
 * Rapporte une cible de période à une cible journalière. Le diviseur est
 * compté sur toute la période de l'objectif (date_debut → date_fin), et non
 * sur les seuls jours déjà écoulés :
 *  - objectif individuel : jours "present" planifiés du vendeur (comme la
 *    colonne « Jours travaillés » de l'admin) ;
 *  - objectif boutique : jours d'ouverture, c.-à-d. dates où au moins un
 *    vendeur est planifié "present".
 * Repli forfaitaire (6 / semaine, 26 / mois) si le planning est vide.
 */
function parJour(o: ObjectifLike, planning: PlanningObjectifs = {}): number {
  const v = cible(o);
  if (o.periode === "jour") return v;
  const jours = o.vendeur_id
    ? planning.vendeur
      ? joursTravailles(planning.vendeur, o.date_debut, o.date_fin)
      : 0
    : planning.boutique
      ? joursOuverts(planning.boutique, o.date_debut, o.date_fin)
      : 0;
  const diviseur = jours > 0 ? jours : PERIODE_JOURS[o.periode] ?? 26;
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
  opts: { vendeurId?: string | null; planning?: PlanningObjectifs } = {},
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
    if (perso) return parJour(perso, opts.planning);
  }
  const boutique = pickBest(forActe(vol.filter((o) => o.vendeur_id === null)));
  return boutique ? parJour(boutique, opts.planning) : 0;
}

/** Cible d'actes de la boutique aujourd'hui (somme des 3 types + objectif global). */
export function objectifBoutiqueJour(
  objectifs: ObjectifLike[],
  today: string = new Date().toISOString().slice(0, 10),
  planningBoutique?: PlanningObjectifs["boutique"],
): number {
  const planning = { boutique: planningBoutique };
  const total =
    objectifVolumeJour(objectifs, "Freebox", today, { planning }) +
    objectifVolumeJour(objectifs, "Forfait mobile", today, { planning }) +
    objectifVolumeJour(objectifs, "Téléphone", today, { planning });
  if (total > 0) return Math.round(total);

  // Repli : ancien objectif global (acte_type null).
  const global = objectifs.find(
    (o) =>
      o.vendeur_id === null &&
      o.acte_type === null &&
      o.type_cible === "volume" &&
      couvre(o, today),
  );
  return global ? Math.round(parJour(global, planning)) : 0;
}

export interface ObjectifJourVendeur {
  /** Cible du jour par catégorie (0 si aucune cible pour ce type d'acte). */
  parCategorie: Record<CatKey, number>;
  /** Cible d'actes totale du jour. */
  total: number;
  /** Provenance : objectifs individuels du vendeur, ou repli boutique. */
  source: "vendeur" | "boutique" | null;
}

/**
 * Objectifs du jour d'un vendeur : ses objectifs individuels en priorité,
 * repli sur ceux de la boutique uniquement s'il n'en a aucun ce jour-là
 * (pas de mélange acte par acte). Le total est la somme des cibles par type
 * d'acte, ou à défaut l'ancien objectif global (acte_type null).
 */
export function objectifsJourVendeur(
  objectifs: ObjectifLike[],
  vendeurId: string,
  today: string = new Date().toISOString().slice(0, 10),
  planning?: PlanningObjectifs,
): ObjectifJourVendeur {
  const volToday = objectifs.filter(
    (o) => o.type_cible === "volume" && couvre(o, today) && cible(o) > 0,
  );
  const hasPerso = volToday.some((o) => o.vendeur_id === vendeurId);
  const owner = hasPerso ? vendeurId : null;
  const scoped = volToday.filter((o) => o.vendeur_id === owner);

  const parCategorie = emptyByCat();
  for (const c of CATEGORIES) {
    parCategorie[c.key] = Math.round(
      objectifVolumeJour(scoped, c.acte, today, { vendeurId: owner, planning }),
    );
  }
  let total = parCategorie.freebox + parCategorie.forfaits + parCategorie.telephones;

  if (total === 0) {
    // Repli : ancien objectif global (acte_type null) de la même portée.
    const global = scoped.find((o) => o.acte_type === null);
    if (global) total = Math.round(parJour(global, planning));
  }

  return {
    parCategorie,
    total,
    source: total > 0 ? (hasPerso ? "vendeur" : "boutique") : null,
  };
}

/** Cible d'actes totale du jour pour un vendeur (tous types confondus). */
export function objectifJourVendeur(
  objectifs: ObjectifLike[],
  vendeurId: string,
  today: string = new Date().toISOString().slice(0, 10),
  planning?: PlanningObjectifs,
): number {
  return objectifsJourVendeur(objectifs, vendeurId, today, planning).total;
}

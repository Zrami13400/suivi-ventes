// Valeurs partagées entre le formulaire de vente, les actions serveur et
// l'administration. Doivent rester alignées avec la contrainte CHECK
// `acte_type in (...)` définie dans migrations/001_commission_par_acte.sql.

export const ACTE_TYPES = ["Freebox", "Forfait mobile", "Téléphone"] as const;

export type ActeType = (typeof ACTE_TYPES)[number];

export function isActeType(value: string): value is ActeType {
  return (ACTE_TYPES as readonly string[]).includes(value);
}

// Options additionnelles proposées selon le type d'acte sélectionné.
export const ACTE_A_MCAFEE: ActeType = "Freebox";
export const ACTE_A_ASSURANCE: ActeType = "Téléphone";

// Slug ASCII stable pour préfixer les noms de champs du formulaire de barème
// dans l'admin (utilisé côté client et côté action serveur).
export const ACTE_FIELD_KEY: Record<ActeType, string> = {
  Freebox: "freebox",
  "Forfait mobile": "forfait_mobile",
  Téléphone: "telephone",
};

// ------------------------------------------------------------------
// Présentation par catégorie (design). L'`acte` reste l'une des 3
// valeurs stockées en base ; les `sousTypes` et `options` sont
// purement informatifs et ne sont pas persistés.
// ------------------------------------------------------------------
export interface CategoryMeta {
  key: "freebox" | "forfaits" | "telephones";
  acte: ActeType;
  label: string;
  short: string;
  /** classe CSS de gradient définie dans globals.css */
  grad: string;
  /** couleur d'accent (texte / barres) */
  accent: string;
  ring: string;
  sousTypes: string[];
  options: string[];
}

export const CATEGORIES: CategoryMeta[] = [
  {
    key: "freebox",
    acte: "Freebox",
    label: "Freebox",
    short: "Box",
    grad: "grad-freebox",
    accent: "text-violet-300",
    ring: "ring-violet-500/30",
    sousTypes: ["Freebox Pop", "Freebox Révolution", "Freebox Delta", "Freebox Ultra"],
    options: ["McAfee"],
  },
  {
    key: "forfaits",
    acte: "Forfait mobile",
    label: "Forfaits mobile",
    short: "Forfaits",
    grad: "grad-forfaits",
    accent: "text-sky-300",
    ring: "ring-sky-500/30",
    sousTypes: ["Série Free", "Forfait Free 5G", "Forfait Illimité", "Forfait 2h / 5 Go"],
    options: [],
  },
  {
    key: "telephones",
    acte: "Téléphone",
    label: "Téléphones",
    short: "Téléphones",
    grad: "grad-telephones",
    accent: "text-emerald-300",
    ring: "ring-emerald-500/30",
    sousTypes: [],
    options: ["Assurance mobile", "Coque", "Reprise", "Garantie"],
  },
];

export function categoryForActe(acte: string): CategoryMeta | undefined {
  return CATEGORIES.find((c) => c.acte === acte);
}

// Palette dédiée aux grands boutons d'action de l'onglet Accueil (distincte
// des dégradés de marque `CATEGORIES[].grad` utilisés ailleurs — logo,
// en-têtes admin, page ventes).
export const ACTE_ACTION_STYLE: Record<
  ActeType,
  { grad: string; ring: string }
> = {
  Freebox: { grad: "grad-action-freebox", ring: "ring-rose-400/40" },
  "Forfait mobile": { grad: "grad-action-forfait", ring: "ring-blue-400/40" },
  Téléphone: { grad: "grad-action-telephone", ring: "ring-emerald-400/40" },
};

// ------------------------------------------------------------------
// Objectifs : types d'actes visés (3 ventes + 2 options) et nature de la cible.
// ------------------------------------------------------------------
export const OBJECTIF_ACTE_TYPES = [
  "Freebox",
  "Forfait mobile",
  "Téléphone",
  "Assurance",
  "McAfee",
] as const;

export type ObjectifActeType = (typeof OBJECTIF_ACTE_TYPES)[number];

// Types d'actes qui portent une cible de taux d'attachement (numérateur /
// dénominateur). Les autres n'ont qu'une cible de volume.
export const ACTE_A_TAUX: Record<ObjectifActeType, string | null> = {
  Freebox: null,
  "Forfait mobile": null,
  Téléphone: null,
  McAfee: "Freebox", // McAfee attaché aux Freebox vendues
  Assurance: "Téléphone", // Assurance attachée aux téléphones vendus
};

export const OBJECTIF_ACTE_FIELD_KEY: Record<ObjectifActeType, string> = {
  Freebox: "freebox",
  "Forfait mobile": "forfait_mobile",
  Téléphone: "telephone",
  Assurance: "assurance",
  McAfee: "mcafee",
};

// ------------------------------------------------------------------
// Planning : statuts de présence et couleurs.
// ------------------------------------------------------------------
export type PlanningStatut =
  | "present"
  | "absent"
  | "conge"
  | "maladie"
  | "formation";

export const PLANNING_STATUTS: {
  key: PlanningStatut;
  label: string;
  court: string;
  cell: string; // classes de la cellule (fond + texte)
  dot: string; // pastille de légende
}[] = [
  { key: "present", label: "Présent", court: "P", cell: "bg-emerald-500/25 text-emerald-200", dot: "bg-emerald-400" },
  { key: "absent", label: "Absent", court: "A", cell: "bg-rose-500/25 text-rose-200", dot: "bg-rose-400" },
  { key: "conge", label: "Congé", court: "C", cell: "bg-amber-500/25 text-amber-200", dot: "bg-amber-400" },
  { key: "maladie", label: "Maladie", court: "M", cell: "bg-fuchsia-500/25 text-fuchsia-200", dot: "bg-fuchsia-400" },
  { key: "formation", label: "Formation", court: "F", cell: "bg-sky-500/25 text-sky-200", dot: "bg-sky-400" },
];

export const PLANNING_META: Record<
  PlanningStatut,
  (typeof PLANNING_STATUTS)[number]
> = Object.fromEntries(PLANNING_STATUTS.map((s) => [s.key, s])) as Record<
  PlanningStatut,
  (typeof PLANNING_STATUTS)[number]
>;

/** Ordre de cycle au clic dans la grille admin (dernier = effacer). */
export const PLANNING_CYCLE: (PlanningStatut | null)[] = [
  "present",
  "absent",
  "conge",
  "maladie",
  "formation",
  null,
];

// ------------------------------------------------------------------
// Niveaux (1 → 5) selon le nombre d'actes réalisés dans le mois.
// ------------------------------------------------------------------
export interface Niveau {
  niveau: number;
  min: number;
  label: string;
}

export const NIVEAUX: Niveau[] = [
  { niveau: 1, min: 0, label: "Débutant" },
  { niveau: 2, min: 20, label: "Confirmé" },
  { niveau: 3, min: 45, label: "Aguerri" },
  { niveau: 4, min: 80, label: "Expert" },
  { niveau: 5, min: 140, label: "Élite" },
];

export function niveauPourActes(actes: number): Niveau {
  let found = NIVEAUX[0];
  for (const n of NIVEAUX) if (actes >= n.min) found = n;
  return found;
}

export function prochainNiveau(actes: number): Niveau | null {
  return NIVEAUX.find((n) => n.min > actes) ?? null;
}

// ------------------------------------------------------------------
// Badges de gamification (attribués mensuellement, cf. lib/kpi.ts).
// ------------------------------------------------------------------
export type BadgeKey =
  | "top_box"
  | "cross_sell"
  | "serieux"
  | "esprit_equipe"
  | "progression";

export const BADGES: Record<BadgeKey, { label: string; emoji: string; desc: string }> = {
  top_box: { label: "Top Box", emoji: "📦", desc: "Meilleur vendeur Freebox du mois" },
  cross_sell: { label: "Meilleur Cross-sell", emoji: "🎯", desc: "Meilleur taux d'options (McAfee / Assurance)" },
  serieux: { label: "Sérieux", emoji: "⏱️", desc: "Le plus régulier — présent sur le plus de jours" },
  esprit_equipe: { label: "Esprit d'équipe", emoji: "🤝", desc: "Des ventes dans les trois catégories" },
  progression: { label: "Progression", emoji: "📈", desc: "Plus forte progression vs le mois précédent" },
};

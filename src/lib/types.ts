// Types reflecting the Supabase database schema.

export type Role = "admin" | "vendeur";
export type Periode = "jour" | "semaine" | "mois";

export interface Shop {
  id: string;
  nom: string;
}

export interface Profile {
  id: string;
  shop_id: string;
  nom_complet: string;
  role: Role;
  avatar_url: string | null;
  created_at: string;
}

// Type d'acte visé par un objectif : les 3 valeurs de vente + les 2 options.
export type ObjectifActeType =
  | "Freebox"
  | "Forfait mobile"
  | "Téléphone"
  | "Assurance"
  | "McAfee";
export type TypeCible = "volume" | "taux";

export interface Objectif {
  id: string;
  shop_id: string;
  vendeur_id: string | null; // null = objectif boutique
  periode: Periode;
  date_debut: string;
  date_fin: string;
  // null = objectif global multi-actes (rétro-compat).
  acte_type: ObjectifActeType | null;
  type_cible: TypeCible;
  // Volume : nombre d'actes cible. Taux : pourcentage cible (0-100).
  valeur_cible: number | null;
  nb_ventes_cible: number | null;
  created_by: string;
  created_at: string;
}

export interface Vente {
  id: string;
  vendeur_id: string;
  shop_id: string;
  acte_type: string;
  quantity: number;
  has_mcafee: boolean;
  has_assurance: boolean;
  has_coque: boolean;
  has_reprise: boolean;
  has_garantie: boolean;
  /** Ids des options_flat cochées (migration 007). Absent avant migration. */
  options?: string[] | null;
  sous_type_id: string | null;
  modele_id: string | null;
  created_at: string;
}

// Sous-produit d'un type d'acte, avec son montant de base €.
export interface SousTypeActe {
  id: string;
  shop_id: string;
  acte_type: string;
  nom: string;
  montant_base: number;
  ordre: number;
}

// Modèle de téléphone configurable par l'admin (migration 006), avec son
// montant de base € et une durée de validité optionnelle (le modèle reste
// utilisable pour les ventes déjà enregistrées même après expiration ;
// seule sa proposition dans le formulaire de vente est filtrée).
export interface ModeleTelephone {
  id: string;
  shop_id: string;
  nom: string;
  marque: string;
  montant_base: number;
  mois_validite: number | null;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

// Option "flat" configurable par l'admin (migration 007) : bonus € par
// attachement sur un type d'acte. `legacy_key` relie les 5 options
// historiques à leur booléen ventes.has_<legacy_key>.
export type OptionLegacyKey = "mcafee" | "assurance" | "coque" | "reprise" | "garantie";

export interface OptionFlat {
  id: string;
  shop_id: string;
  nom: string;
  acte_type: string;
  montant_bonus: number;
  actif: boolean;
  ordre: number;
  legacy_key: OptionLegacyKey | null;
  created_at: string;
}

export interface OptionBonusDetail {
  id: string;
  nom: string;
  acte_type: string;
  qte: number;
  montant: number;
}

// Ligne de barème "flat" par type d'acte et par boutique (montant par acte de
// repli quand aucun sous-type n'est renseigné). Les colonnes bonus_* ne sont
// plus lues depuis la migration 007 (remplacées par options_flat).
export interface ReglePrime {
  id: string;
  shop_id: string;
  acte_type: string;
  montant_par_acte: number;
  bonus_mcafee: number;
  bonus_assurance: number;
  bonus_coque: number;
  bonus_reprise: number;
  bonus_garantie: number;
}

// Paliers de boost par type d'acte.
export interface PalierPrime {
  id: string;
  shop_id: string;
  acte_type: string;
  seuil_individuel: number;
  boost_individuel: number;
  boost_collectif: number;
}

export interface PrimeJournaliere {
  id: string;
  vendeur_id: string;
  date: string;
  total_ventes: number;
  prime_calculee: number;
  updated_at: string;
}

// Prime du mois ventilée, par vendeur (migration 003). Toujours privée.
export interface PrimeMensuelle {
  id: string;
  vendeur_id: string;
  shop_id: string;
  mois: string; // 1er jour du mois, AAAA-MM-01
  prime_base: number;
  boost_individuel: number;
  boost_collectif: number;
  bonus_mcafee: number;
  bonus_assurance: number;
  bonus_coque: number;
  bonus_reprise: number;
  bonus_garantie: number;
  /** Total des bonus options + ventilation (migration 007). */
  bonus_options?: number | null;
  bonus_options_detail?: OptionBonusDetail[] | null;
  prime_totale: number;
  total_actes: number;
  updated_at: string;
}

export type PlanningStatut =
  | "present"
  | "absent"
  | "conge"
  | "maladie"
  | "formation";

export interface Planning {
  id: string;
  vendeur_id: string;
  shop_id: string;
  date: string;
  statut: PlanningStatut;
  created_at: string;
}

// Table optionnelle `challenges` (migration 002_challenges.sql). Les pages
// dégradent proprement si la table n'existe pas encore.
export type ChallengeStatut = "a_venir" | "en_cours" | "termine";

export interface Challenge {
  id: string;
  shop_id: string;
  titre: string;
  description: string | null;
  // Type de mesure : "actes" (tous), ou l'une des 3 valeurs d'acte_type.
  metrique: string;
  date_debut: string;
  date_fin: string;
  // Participants : liste d'ids de profils (2+).
  participant_ids: string[];
  prime_bonus: number;
  created_by: string;
  created_at: string;
}

// Row shape from the progression_objectifs view. Column names are guessed from
// the underlying tables; unknown extras are tolerated via the index signature.
export interface ProgressionObjectif {
  id: string;
  objectif_id: string;
  shop_id: string;
  vendeur_id: string | null;
  periode: Periode;
  date_debut: string;
  date_fin: string;
  acte_type: ObjectifActeType | null;
  type_cible: TypeCible;
  valeur_cible: number | null;
  nb_ventes_cible: number | null;
  nb_ventes_realise: number | null;
  volume_realise: number | null;
  taux_base: number | null;
  taux_realise: number | null;
  jours_travailles: number | null;
  [key: string]: unknown;
}

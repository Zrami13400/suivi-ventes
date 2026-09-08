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
  created_at: string;
}

export interface Objectif {
  id: string;
  shop_id: string;
  vendeur_id: string | null;
  periode: Periode;
  date_debut: string;
  date_fin: string;
  nb_ventes_cible: number;
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
  created_at: string;
}

// Une ligne de barème par type d'acte et par boutique.
export interface ReglePrime {
  id: string;
  shop_id: string;
  acte_type: string;
  montant_par_acte: number;
  bonus_mcafee: number;
  bonus_assurance: number;
}

export interface PrimeJournaliere {
  id: string;
  vendeur_id: string;
  date: string;
  // Nombre total d'actes vendus dans la journée (et non plus un montant €).
  total_ventes: number;
  prime_calculee: number;
  updated_at: string;
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
  shop_id: string;
  vendeur_id: string | null;
  periode: Periode;
  date_debut: string;
  date_fin: string;
  nb_ventes_cible: number;
  nb_ventes_realise: number | null;
  [key: string]: unknown;
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  ACTE_A_TAUX,
  OBJECTIF_ACTE_FIELD_KEY,
  OBJECTIF_ACTE_TYPES,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { PlanningStatut } from "@/lib/types";

type FormResult = { error: string | null; success: boolean };

const PERIODES = ["jour", "semaine", "mois"];

function parseNum(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").replace(",", ".").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

function revalidateAll() {
  for (const p of [
    "/admin",
    "/admin/objectifs",
    "/admin/primes",
    "/admin/planning",
    "/dashboard",
    "/objectifs",
    "/ventes",
    "/planning",
    "/classement",
    "/profil",
  ]) {
    revalidatePath(p);
  }
}

// ============================================================
// OBJECTIFS
// ============================================================
export async function createObjectif(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const admin = await requireAdmin();

  const periode = String(formData.get("periode") ?? "");
  const date_debut = String(formData.get("date_debut") ?? "");
  const date_fin = String(formData.get("date_fin") ?? "");
  const cibleRaw = String(formData.get("cible") ?? ""); // "boutique" | vendeur_id
  const vendeur_id = cibleRaw === "boutique" || cibleRaw === "" ? null : cibleRaw;

  if (!PERIODES.includes(periode)) {
    return { error: "Période invalide.", success: false };
  }
  if (!date_debut || !date_fin || date_fin < date_debut) {
    return { error: "Plage de dates invalide.", success: false };
  }

  type Row = {
    shop_id: string;
    vendeur_id: string | null;
    periode: string;
    date_debut: string;
    date_fin: string;
    acte_type: string;
    type_cible: "volume" | "taux";
    valeur_cible: number;
    nb_ventes_cible: number | null;
    created_by: string;
  };

  const rows: Row[] = [];
  for (const acte of OBJECTIF_ACTE_TYPES) {
    const key = OBJECTIF_ACTE_FIELD_KEY[acte];
    const vol = parseNum(formData.get(`${key}__volume`));
    const taux = parseNum(formData.get(`${key}__taux`));

    if (Number.isNaN(vol) || Number.isNaN(taux)) {
      return { error: "Valeurs numériques invalides.", success: false };
    }
    if (vol != null && vol > 0) {
      rows.push({
        shop_id: admin.shop_id,
        vendeur_id,
        periode,
        date_debut,
        date_fin,
        acte_type: acte,
        type_cible: "volume",
        valeur_cible: vol,
        nb_ventes_cible: Math.round(vol),
        created_by: admin.id,
      });
    }
    if (taux != null && taux > 0 && ACTE_A_TAUX[acte]) {
      if (taux > 100) {
        return { error: "Un taux ne peut pas dépasser 100 %.", success: false };
      }
      rows.push({
        shop_id: admin.shop_id,
        vendeur_id,
        periode,
        date_debut,
        date_fin,
        acte_type: acte,
        type_cible: "taux",
        valeur_cible: taux,
        nb_ventes_cible: null,
        created_by: admin.id,
      });
    }
  }

  if (rows.length === 0) {
    return { error: "Renseignez au moins une cible.", success: false };
  }

  const supabase = createClient();

  // Idempotence : remplace les objectifs de même portée/période/dates/type.
  for (const r of rows) {
    let del = supabase
      .from("objectifs")
      .delete()
      .eq("shop_id", r.shop_id)
      .eq("periode", r.periode)
      .eq("date_debut", r.date_debut)
      .eq("date_fin", r.date_fin)
      .eq("acte_type", r.acte_type)
      .eq("type_cible", r.type_cible);
    del = r.vendeur_id
      ? del.eq("vendeur_id", r.vendeur_id)
      : del.is("vendeur_id", null);
    await del;
  }

  const { error } = await supabase.from("objectifs").insert(rows);
  if (error) return { error: error.message, success: false };

  revalidateAll();
  return { error: null, success: true };
}

export async function updateObjectifValeur(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const v = parseNum(formData.get("valeur_cible"));
  if (!id || v == null || Number.isNaN(v)) return;
  const supabase = createClient();
  await supabase
    .from("objectifs")
    .update({ valeur_cible: v, nb_ventes_cible: Math.round(v) })
    .eq("id", id);
  revalidateAll();
}

export async function deleteObjectif(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = createClient();
  await supabase.from("objectifs").delete().eq("id", id);
  revalidateAll();
}

// ============================================================
// PLANNING
// ============================================================
const PLANNING_STATUTS: PlanningStatut[] = [
  "present",
  "absent",
  "conge",
  "maladie",
  "formation",
];

export async function setPlanning(
  vendeurId: string,
  date: string,
  statut: PlanningStatut | null,
): Promise<{ error: string | null }> {
  const admin = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(vendeurId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Paramètres invalides." };
  }
  const supabase = createClient();

  // Le vendeur doit appartenir à la boutique de l'admin.
  const { data: v } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", vendeurId)
    .maybeSingle();
  if (!v || v.shop_id !== admin.shop_id) return { error: "Vendeur inconnu." };

  if (statut === null) {
    const { error } = await supabase
      .from("planning")
      .delete()
      .eq("vendeur_id", vendeurId)
      .eq("date", date);
    if (error) return { error: error.message };
  } else {
    if (!PLANNING_STATUTS.includes(statut)) return { error: "Statut invalide." };
    const { error } = await supabase
      .from("planning")
      .upsert(
        { vendeur_id: vendeurId, shop_id: admin.shop_id, date, statut },
        { onConflict: "vendeur_id,date" },
      );
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/planning");
  revalidatePath("/planning");
  revalidatePath("/admin/objectifs");
  revalidatePath("/objectifs");
  return { error: null };
}

// ============================================================
// BARÈME DE PRIMES (sous-types + paliers + bonus options)
// ============================================================
export async function updateBaremePrimes(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const admin = await requireAdmin();
  const supabase = createClient();

  // 1. Montants de base des sous-types (champs "st__<id>").
  const sousTypeUpdates: { id: string; montant_base: number }[] = [];
  for (const [name, value] of Array.from(formData.entries())) {
    if (!name.startsWith("st__")) continue;
    const id = name.slice(4);
    const n = parseNum(value);
    if (n == null || Number.isNaN(n)) {
      return { error: "Montant de base invalide.", success: false };
    }
    sousTypeUpdates.push({ id, montant_base: n });
  }

  // 2. Paliers par type d'acte (champs "pal__<key>__<champ>").
  const ACTES = ["Freebox", "Forfait mobile", "Téléphone"] as const;
  const KEY: Record<string, string> = {
    Freebox: "freebox",
    "Forfait mobile": "forfait_mobile",
    Téléphone: "telephone",
  };
  const paliers = ACTES.map((acte_type) => {
    const k = KEY[acte_type];
    return {
      shop_id: admin.shop_id,
      acte_type,
      seuil_individuel: parseNum(formData.get(`pal__${k}__seuil`)) ?? 0,
      boost_individuel: parseNum(formData.get(`pal__${k}__boost_ind`)) ?? 0,
      boost_collectif: parseNum(formData.get(`pal__${k}__boost_col`)) ?? 0,
    };
  });
  if (
    paliers.some(
      (p) =>
        Number.isNaN(p.seuil_individuel) ||
        Number.isNaN(p.boost_individuel) ||
        Number.isNaN(p.boost_collectif),
    )
  ) {
    return { error: "Valeur de palier invalide.", success: false };
  }

  // 3. Bonus options (flat) sur regles_primes.
  const bonusMcafee = parseNum(formData.get("bonus_mcafee")) ?? 0;
  const bonusAssurance = parseNum(formData.get("bonus_assurance")) ?? 0;
  if (Number.isNaN(bonusMcafee) || Number.isNaN(bonusAssurance)) {
    return { error: "Bonus option invalide.", success: false };
  }

  for (const u of sousTypeUpdates) {
    const { error } = await supabase
      .from("sous_types_actes")
      .update({ montant_base: u.montant_base })
      .eq("id", u.id)
      .eq("shop_id", admin.shop_id);
    if (error) return { error: error.message, success: false };
  }

  const { error: palErr } = await supabase
    .from("paliers_primes")
    .upsert(paliers, { onConflict: "shop_id,acte_type" });
  if (palErr) return { error: palErr.message, success: false };

  const { error: regErr } = await supabase
    .from("regles_primes")
    .upsert(
      [
        { shop_id: admin.shop_id, acte_type: "Freebox", bonus_mcafee: bonusMcafee },
        {
          shop_id: admin.shop_id,
          acte_type: "Téléphone",
          bonus_assurance: bonusAssurance,
        },
      ],
      { onConflict: "shop_id,acte_type" },
    );
  if (regErr) return { error: regErr.message, success: false };

  const { error: rpcErr } = await supabase.rpc("recalculer_primes_boutique", {
    p_shop_id: admin.shop_id,
  });

  revalidateAll();

  if (rpcErr) {
    return {
      error: "Barème enregistré, mais le recalcul a échoué : " + rpcErr.message,
      success: false,
    };
  }
  return { error: null, success: true };
}

export async function addSousType(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const acte_type = String(formData.get("acte_type") ?? "");
  const nom = String(formData.get("nom") ?? "").trim();
  const montant_base = parseNum(formData.get("montant_base")) ?? 0;
  if (
    !["Freebox", "Forfait mobile", "Téléphone"].includes(acte_type) ||
    !nom ||
    Number.isNaN(montant_base)
  ) {
    return;
  }
  const supabase = createClient();
  await supabase.from("sous_types_actes").insert({
    shop_id: admin.shop_id,
    acte_type,
    nom,
    montant_base,
    ordre: 99,
  });
  revalidatePath("/admin/primes");
  revalidatePath("/ventes");
}

export async function deleteSousType(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = createClient();
  await supabase
    .from("sous_types_actes")
    .delete()
    .eq("id", id)
    .eq("shop_id", admin.shop_id);
  revalidatePath("/admin/primes");
  revalidatePath("/ventes");
}

// ============================================================
// CHALLENGES
// ============================================================
const CHALLENGE_METRIQUES = [
  "actes",
  "Freebox",
  "Forfait mobile",
  "Téléphone",
] as const;

export async function createChallenge(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const admin = await requireAdmin();

  const titre = String(formData.get("titre") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const metrique = String(formData.get("metrique") ?? "actes");
  const date_debut = String(formData.get("date_debut") ?? "");
  const date_fin = String(formData.get("date_fin") ?? "");
  const prime_bonus = Number(
    String(formData.get("prime_bonus") ?? "0").replace(",", "."),
  );
  const participant_ids = formData
    .getAll("participants")
    .map(String)
    .filter(Boolean);

  if (!titre) return { error: "Le titre est requis.", success: false };
  if (!(CHALLENGE_METRIQUES as readonly string[]).includes(metrique)) {
    return { error: "Métrique invalide.", success: false };
  }
  if (!date_debut || !date_fin || date_fin < date_debut) {
    return { error: "Plage de dates invalide.", success: false };
  }
  if (participant_ids.length < 2) {
    return { error: "Sélectionnez au moins deux participants.", success: false };
  }
  if (!Number.isFinite(prime_bonus) || prime_bonus < 0) {
    return { error: "Prime bonus invalide.", success: false };
  }

  const supabase = createClient();
  const { error } = await supabase.from("challenges").insert({
    shop_id: admin.shop_id,
    titre,
    description,
    metrique,
    date_debut,
    date_fin,
    participant_ids,
    prime_bonus,
    created_by: admin.id,
  });

  if (error) return { error: error.message, success: false };

  revalidatePath("/admin/challenges");
  revalidatePath("/challenges");
  return { error: null, success: true };
}

export async function deleteChallenge(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = createClient();
  await supabase.from("challenges").delete().eq("id", id);
  revalidatePath("/admin/challenges");
  revalidatePath("/challenges");
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { ACTE_FIELD_KEY, ACTE_TYPES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

type FormResult = { error: string | null; success: boolean };

export async function createObjectif(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const admin = await requireAdmin();

  const periode = String(formData.get("periode") ?? "");
  const date_debut = String(formData.get("date_debut") ?? "");
  const date_fin = String(formData.get("date_fin") ?? "");
  const nb_ventes_cible = Number(formData.get("nb_ventes_cible"));
  const vendeurRaw = String(formData.get("vendeur_id") ?? "");
  const vendeur_id = vendeurRaw === "" ? null : vendeurRaw;

  if (!["jour", "semaine", "mois"].includes(periode)) {
    return { error: "Période invalide.", success: false };
  }
  if (!date_debut || !date_fin || date_fin < date_debut) {
    return { error: "Plage de dates invalide.", success: false };
  }
  if (!Number.isInteger(nb_ventes_cible) || nb_ventes_cible < 0) {
    return { error: "Nombre d'actes cible invalide.", success: false };
  }

  const supabase = createClient();
  const { error } = await supabase.from("objectifs").insert({
    shop_id: admin.shop_id,
    vendeur_id,
    periode,
    date_debut,
    date_fin,
    nb_ventes_cible,
    created_by: admin.id,
  });

  if (error) return { error: error.message, success: false };

  revalidatePath("/admin/objectifs");
  revalidatePath("/admin");
  return { error: null, success: true };
}

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
  const participant_ids = formData.getAll("participants").map(String).filter(Boolean);

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

export async function deleteObjectif(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = createClient();
  await supabase.from("objectifs").delete().eq("id", id);
  revalidatePath("/admin/objectifs");
  revalidatePath("/admin");
}

/**
 * Enregistre le barème de commission : une ligne `regles_primes` par type
 * d'acte (montant par acte + bonus McAfee / Assurance), puis force le
 * recalcul des primes du jour pour que l'affichage temps réel se mette à
 * jour immédiatement.
 */
export async function updateReglesPrimes(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const admin = await requireAdmin();

  const parseAmount = (name: string): number | null => {
    const raw = String(formData.get(name) ?? "").replace(",", ".").trim();
    if (raw === "") return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };

  const rows = ACTE_TYPES.map((acte_type) => {
    const key = ACTE_FIELD_KEY[acte_type];
    return {
      shop_id: admin.shop_id,
      acte_type,
      montant_par_acte: parseAmount(`${key}__montant_par_acte`),
      bonus_mcafee: parseAmount(`${key}__bonus_mcafee`),
      bonus_assurance: parseAmount(`${key}__bonus_assurance`),
    };
  });

  if (
    rows.some(
      (r) =>
        r.montant_par_acte === null ||
        r.bonus_mcafee === null ||
        r.bonus_assurance === null,
    )
  ) {
    return {
      error: "Tous les montants doivent être des nombres positifs ou nuls.",
      success: false,
    };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("regles_primes")
    .upsert(rows, { onConflict: "shop_id,acte_type" });

  if (error) return { error: error.message, success: false };

  // Recalcule les primes du jour avec le nouveau barème (best effort).
  const { error: rpcError } = await supabase.rpc("recalculer_primes_du_jour", {
    p_shop_id: admin.shop_id,
  });

  revalidatePath("/admin/primes");
  revalidatePath("/admin");
  revalidatePath("/dashboard");

  if (rpcError) {
    return {
      error:
        "Barème enregistré, mais le recalcul immédiat a échoué : " +
        rpcError.message,
      success: false,
    };
  }

  return { error: null, success: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { ACTE_A_ASSURANCE, ACTE_A_MCAFEE, isActeType } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export async function createVente(
  _prevState: { error: string | null; success: boolean },
  formData: FormData,
): Promise<{ error: string | null; success: boolean }> {
  const profile = await getCurrentProfile();

  const acte_type = String(formData.get("acte_type") ?? "").trim();
  const quantity = Number(formData.get("quantity") ?? 1);

  if (!isActeType(acte_type)) {
    return { error: "Type d'acte invalide.", success: false };
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { error: "La quantité doit être un entier positif.", success: false };
  }

  // Les options ne sont valides que pour le type d'acte correspondant.
  const has_mcafee =
    acte_type === ACTE_A_MCAFEE && formData.get("has_mcafee") === "on";
  const has_assurance =
    acte_type === ACTE_A_ASSURANCE && formData.get("has_assurance") === "on";
  const has_coque =
    acte_type === ACTE_A_ASSURANCE && formData.get("has_coque") === "on";
  const has_reprise =
    acte_type === ACTE_A_ASSURANCE && formData.get("has_reprise") === "on";
  const has_garantie =
    acte_type === ACTE_A_ASSURANCE && formData.get("has_garantie") === "on";

  const sousTypeRaw = String(formData.get("sous_type_id") ?? "").trim();
  const modeleRaw = String(formData.get("modele_id") ?? "").trim();
  const supabase = createClient();

  // Vérifie que le sous-type appartient bien à la boutique et au type d'acte.
  let sous_type_id: string | null = null;
  if (sousTypeRaw) {
    const { data: st } = await supabase
      .from("sous_types_actes")
      .select("id, acte_type, shop_id")
      .eq("id", sousTypeRaw)
      .maybeSingle();
    if (st && st.shop_id === profile.shop_id && st.acte_type === acte_type) {
      sous_type_id = st.id;
    }
  }

  // Le modèle de téléphone (montant de base) n'est valide que pour un acte
  // Téléphone et doit appartenir à la boutique de l'appelant.
  let modele_id: string | null = null;
  if (modeleRaw && acte_type === "Téléphone") {
    const { data: mt } = await supabase
      .from("modeles_telephones")
      .select("id, shop_id")
      .eq("id", modeleRaw)
      .maybeSingle();
    if (mt && mt.shop_id === profile.shop_id) {
      modele_id = mt.id;
    }
  }

  const { error } = await supabase.from("ventes").insert({
    vendeur_id: profile.id,
    shop_id: profile.shop_id,
    acte_type,
    quantity,
    has_mcafee,
    has_assurance,
    has_coque,
    has_reprise,
    has_garantie,
    sous_type_id,
    modele_id,
  });

  if (error) {
    return { error: error.message, success: false };
  }

  for (const p of [
    "/dashboard",
    "/ventes",
    "/objectifs",
    "/classement",
    "/profil",
    "/admin",
  ]) {
    revalidatePath(p);
  }
  return { error: null, success: true };
}

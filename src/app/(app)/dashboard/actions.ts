"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { isActeType } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { OptionLegacyKey } from "@/lib/types";

const LEGACY_ACTE: Record<OptionLegacyKey, string> = {
  mcafee: "Freebox",
  assurance: "Téléphone",
  coque: "Téléphone",
  reprise: "Téléphone",
  garantie: "Téléphone",
};

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

  const sousTypeRaw = String(formData.get("sous_type_id") ?? "").trim();
  const modeleRaw = String(formData.get("modele_id") ?? "").trim();
  // Numéro client : facultatif, uniquement pour une vente Freebox.
  const numero_client =
    acte_type === "Freebox"
      ? String(formData.get("numero_client") ?? "").trim().slice(0, 64) || null
      : null;
  const supabase = await createClient();

  // Options cochées : ids d'options_flat ("option_ids", multiple). Les
  // anciens champs has_<clé>=on restent acceptés.
  const postedIds = new Set(
    formData.getAll("option_ids").map((x) => String(x).trim()).filter(Boolean),
  );
  const legacy: Record<OptionLegacyKey, boolean> = {
    mcafee: false,
    assurance: false,
    coque: false,
    reprise: false,
    garantie: false,
  };
  for (const key of Object.keys(legacy) as OptionLegacyKey[]) {
    if (
      LEGACY_ACTE[key] === acte_type &&
      (formData.get(`has_${key}`) === "on" || postedIds.has(`legacy-${key}`))
    ) {
      legacy[key] = true;
    }
  }

  // Ne retient que les options actives de la boutique, pour ce type d'acte.
  // Table absente (migration 007 non exécutée) : seuls les booléens comptent.
  let options: string[] | null = null;
  const { data: opts, error: optsErr } = await supabase
    .from("options_flat")
    .select("id, legacy_key")
    .eq("shop_id", profile.shop_id)
    .eq("acte_type", acte_type)
    .eq("actif", true);
  if (!optsErr) {
    options = [];
    for (const o of opts ?? []) {
      if (!postedIds.has(o.id)) continue;
      options.push(o.id);
      // Garde les booléens historiques alimentés (objectifs de taux, badges).
      const key = o.legacy_key as OptionLegacyKey | null;
      if (key && key in legacy) legacy[key] = true;
    }
  }

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
    has_mcafee: legacy.mcafee,
    has_assurance: legacy.assurance,
    has_coque: legacy.coque,
    has_reprise: legacy.reprise,
    has_garantie: legacy.garantie,
    ...(options ? { options } : {}),
    sous_type_id,
    modele_id,
    // Colonne envoyée seulement si renseignée (migration 009 éventuellement absente).
    ...(numero_client ? { numero_client } : {}),
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

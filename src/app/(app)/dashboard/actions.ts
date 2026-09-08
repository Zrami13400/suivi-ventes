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

  const supabase = createClient();
  const { error } = await supabase.from("ventes").insert({
    vendeur_id: profile.id,
    shop_id: profile.shop_id,
    acte_type,
    quantity,
    has_mcafee,
    has_assurance,
  });

  if (error) {
    return { error: error.message, success: false };
  }

  revalidatePath("/dashboard");
  revalidatePath("/ventes");
  revalidatePath("/objectifs");
  revalidatePath("/classement");
  revalidatePath("/profil");
  return { error: null, success: true };
}

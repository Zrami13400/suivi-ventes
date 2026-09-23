"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/**
 * Annule (soft) une vente : statut = 'annulée'. Un vendeur ne peut annuler
 * que ses propres ventes du jour ; un admin toute vente de sa boutique.
 * La RLS et le trigger de la migration 008 appliquent les mêmes règles
 * côté base (annulee_le / annulee_par sont posés par la base).
 */
export async function annulerVente(
  venteId: string,
  motif: string,
): Promise<{ error: string | null }> {
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const { data: vente, error: readErr } = await supabase
    .from("ventes")
    .select("id, vendeur_id, shop_id, created_at, statut")
    .eq("id", venteId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!vente || vente.shop_id !== profile.shop_id) {
    return { error: "Vente introuvable." };
  }
  if (vente.statut === "annulée") return { error: "Cette vente est déjà annulée." };

  if (profile.role !== "admin") {
    if (vente.vendeur_id !== profile.id) {
      return { error: "Tu ne peux annuler que tes propres ventes." };
    }
    if (String(vente.created_at).slice(0, 10) !== todayISO()) {
      return { error: "Seules les ventes du jour peuvent être annulées. Demande à un admin." };
    }
  }

  const { data, error } = await supabase
    .from("ventes")
    .update({
      statut: "annulée",
      motif_annulation: motif.trim().slice(0, 200) || null,
    })
    .eq("id", venteId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Annulation refusée (droits insuffisants)." };
  }

  for (const p of [
    "/dashboard",
    "/ventes",
    "/objectifs",
    "/classement",
    "/challenges",
    "/profil",
    "/admin",
    "/admin/annulations",
  ]) {
    revalidatePath(p);
  }
  return { error: null };
}

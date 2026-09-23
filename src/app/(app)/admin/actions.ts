"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  ACTE_A_TAUX,
  ACTE_TYPES,
  OBJECTIF_ACTE_FIELD_KEY,
  OBJECTIF_ACTE_TYPES,
} from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
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
    "/admin/modeles",
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

  const supabase = await createClient();

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
  const supabase = await createClient();
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
  const supabase = await createClient();
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
  const supabase = await createClient();

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
// BARÈME DE PRIMES (sous-types + paliers + options flat)
// ============================================================
export async function updateBaremePrimes(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

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

  // 3. Options flat (champ caché "options_json", cf. BaremeForm).
  const parsedOptions = parseOptionsJson(formData.get("options_json"));
  if (typeof parsedOptions === "string") {
    return { error: parsedOptions, success: false };
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

  if (parsedOptions) {
    const optErr = await saveOptionsFlat(admin.shop_id, parsedOptions);
    if (optErr) return { error: optErr, success: false };
  }

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

type OptionInput = {
  id: string | null;
  nom: string;
  acte_type: string;
  montant_bonus: number;
  actif: boolean;
  ordre: number;
};

/**
 * Valide la liste d'options envoyée par le formulaire de barème.
 * null = champ absent (rien à faire) ; string = message d'erreur.
 */
function parseOptionsJson(raw: FormDataEntryValue | null): OptionInput[] | null | string {
  if (raw == null || raw === "") return null;
  let data: unknown;
  try {
    data = JSON.parse(String(raw));
  } catch {
    return "Liste d'options illisible.";
  }
  if (!Array.isArray(data)) return "Liste d'options illisible.";

  const out: OptionInput[] = [];
  const seen = new Set<string>();
  for (const item of data as Record<string, unknown>[]) {
    const acte_type = String(item?.acte_type ?? "");
    const nom = String(item?.nom ?? "").trim();
    const montant = parseNum(String(item?.montant_bonus ?? ""));
    const id = typeof item?.id === "string" && item.id ? item.id : null;
    if (!(ACTE_TYPES as readonly string[]).includes(acte_type)) {
      return "Type d'acte d'option invalide.";
    }
    if (!nom) return `Une option ${acte_type} n'a pas de nom.`;
    if (montant != null && Number.isNaN(montant)) {
      return `Montant invalide pour l'option « ${nom} ».`;
    }
    const dedupe = `${acte_type}|${nom.toLowerCase()}`;
    if (seen.has(dedupe)) {
      return `L'option « ${nom} » existe en double pour ${acte_type}.`;
    }
    seen.add(dedupe);
    out.push({
      id,
      nom,
      acte_type,
      montant_bonus: montant ?? 0,
      actif: item?.actif !== false,
      ordre: Number.isInteger(item?.ordre) ? Number(item.ordre) : out.length,
    });
  }
  return out;
}

/**
 * Synchronise options_flat avec la liste éditée : supprime les options
 * retirées, met à jour les existantes, insère les nouvelles (dans cet ordre,
 * pour qu'un nom libéré par une suppression soit réutilisable).
 */
async function saveOptionsFlat(
  shopId: string,
  options: OptionInput[],
): Promise<string | null> {
  const supabase = await createClient();
  const { data: existing, error } = await supabase
    .from("options_flat")
    .select("id")
    .eq("shop_id", shopId);
  if (error) {
    return "Table options_flat introuvable — exécutez migrations/007_options_flat.sql. " + error.message;
  }

  const existingIds = new Set((existing ?? []).map((o) => o.id as string));
  const keptIds = new Set(options.flatMap((o) => (o.id && existingIds.has(o.id) ? [o.id] : [])));
  const toDelete = Array.from(existingIds).filter((id) => !keptIds.has(id));

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from("options_flat")
      .delete()
      .eq("shop_id", shopId)
      .in("id", toDelete);
    if (delErr) return delErr.message;
  }

  for (const o of options) {
    if (!o.id || !existingIds.has(o.id)) continue;
    const { error: updErr } = await supabase
      .from("options_flat")
      .update({
        nom: o.nom,
        montant_bonus: o.montant_bonus,
        actif: o.actif,
        ordre: o.ordre,
      })
      .eq("id", o.id)
      .eq("shop_id", shopId);
    if (updErr) return `Option « ${o.nom} » : ${updErr.message}`;
  }

  const inserts = options
    .filter((o) => !o.id || !existingIds.has(o.id))
    .map((o) => ({
      shop_id: shopId,
      nom: o.nom,
      acte_type: o.acte_type,
      montant_bonus: o.montant_bonus,
      actif: o.actif,
      ordre: o.ordre,
    }));
  if (inserts.length > 0) {
    const { error: insErr } = await supabase.from("options_flat").insert(inserts);
    if (insErr) return insErr.message;
  }
  return null;
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
  const supabase = await createClient();
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
  const supabase = await createClient();
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

  const supabase = await createClient();
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
  const supabase = await createClient();
  await supabase.from("challenges").delete().eq("id", id);
  revalidatePath("/admin/challenges");
  revalidatePath("/challenges");
}

// ============================================================
// MODELES DE TELEPHONES (catalogue configurable)
// ============================================================
export async function createModele(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const marque = String(formData.get("marque") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const montant_base = parseNum(formData.get("montant_base")) ?? 0;
  const moisRaw = String(formData.get("mois_validite") ?? "").trim();
  const mois_validite = moisRaw ? Number(moisRaw) : null;

  if (!marque || !nom || Number.isNaN(montant_base)) return;
  if (mois_validite != null && (!Number.isInteger(mois_validite) || mois_validite <= 0)) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("modeles_telephones").insert({
    shop_id: admin.shop_id,
    marque,
    nom,
    montant_base,
    mois_validite,
    actif: true,
  });
  revalidatePath("/admin/modeles");
  revalidatePath("/ventes");
  revalidatePath("/dashboard");
}

export async function updateModele(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const marque = String(formData.get("marque") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const montant_base = parseNum(formData.get("montant_base")) ?? 0;
  const moisRaw = String(formData.get("mois_validite") ?? "").trim();
  const mois_validite = moisRaw ? Number(moisRaw) : null;
  const actif = formData.get("actif") === "on";

  if (!id || !marque || !nom || Number.isNaN(montant_base)) return;
  if (mois_validite != null && (!Number.isInteger(mois_validite) || mois_validite <= 0)) {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("modeles_telephones")
    .update({
      marque,
      nom,
      montant_base,
      mois_validite,
      actif,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("shop_id", admin.shop_id);
  revalidatePath("/admin/modeles");
  revalidatePath("/ventes");
  revalidatePath("/dashboard");
}

export async function deleteModele(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("modeles_telephones")
    .delete()
    .eq("id", id)
    .eq("shop_id", admin.shop_id);
  revalidatePath("/admin/modeles");
  revalidatePath("/ventes");
  revalidatePath("/dashboard");
}

// ============================================================
// VENDEURS (création via /api/admin/create-seller ; suppression ici)
// ============================================================
export async function deleteSeller(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id || id === admin.id) return;

  const supabase = await createClient();
  const { data: seller } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", id)
    .maybeSingle();
  if (!seller || seller.shop_id !== admin.shop_id) return;

  // Client service_role : la suppression du compte auth et la levée d'une
  // éventuelle absence de politique RLS "delete" sur profiles nécessitent
  // un accès privilégié, indépendant de la session de l'admin appelant.
  const supabaseAdmin = createAdminClient();
  await supabaseAdmin.from("profiles").delete().eq("id", id);
  await supabaseAdmin.auth.admin.deleteUser(id);

  revalidatePath("/admin/vendeurs");
}

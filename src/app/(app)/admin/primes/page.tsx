import BaremeForm from "@/components/BaremeForm";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PalierPrime, ReglePrime, SousTypeActe } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPrimesPage() {
  const admin = await requireAdmin();
  const supabase = createClient();

  const [sousTypesRes, paliersRes, reglesRes] = await Promise.all([
    supabase
      .from("sous_types_actes")
      .select("*")
      .eq("shop_id", admin.shop_id)
      .order("acte_type")
      .order("ordre"),
    supabase.from("paliers_primes").select("*").eq("shop_id", admin.shop_id),
    supabase.from("regles_primes").select("*").eq("shop_id", admin.shop_id),
  ]);

  const error = sousTypesRes.error || paliersRes.error || reglesRes.error;
  const sousTypes = (sousTypesRes.data ?? []) as SousTypeActe[];
  const paliers = (paliersRes.data ?? []) as PalierPrime[];
  const regles = (reglesRes.data ?? []) as ReglePrime[];

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-white">
          Barème de commission à paliers
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Pour chaque type d&apos;acte : un montant de base par sous-produit
          vendu, un boost individuel (seuil mensuel dépassé) et un boost
          collectif (partagé si la boutique dépasse son objectif mensuel).
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {sousTypesRes.error || paliersRes.error
              ? "Tables introuvables — exécutez migrations/003_objectifs_planning_paliers.sql. "
              : ""}
            {error.message}
          </p>
        )}

        <div className="mt-4">
          <BaremeForm sousTypes={sousTypes} paliers={paliers} regles={regles} />
        </div>
      </div>
    </div>
  );
}

import BaremeForm from "@/components/BaremeForm";
import { requireAdmin } from "@/lib/auth";
import { sortOptions } from "@/lib/kpi";
import { createClient } from "@/lib/supabase/server";
import type { OptionFlat, PalierPrime, SousTypeActe } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPrimesPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const [sousTypesRes, paliersRes, optionsRes, usageRes] = await Promise.all([
    supabase
      .from("sous_types_actes")
      .select("*")
      .eq("shop_id", admin.shop_id)
      .order("acte_type")
      .order("ordre"),
    supabase.from("paliers_primes").select("*").eq("shop_id", admin.shop_id),
    supabase.from("options_flat").select("*").eq("shop_id", admin.shop_id),
    supabase.rpc("options_flat_usage", { p_shop_id: admin.shop_id }),
  ]);

  const error = sousTypesRes.error || paliersRes.error;
  const sousTypes = (sousTypesRes.data ?? []) as SousTypeActe[];
  const paliers = (paliersRes.data ?? []) as PalierPrime[];
  // null = migration 007 non exécutée : la liste d'options n'est pas éditable.
  const options = optionsRes.error
    ? null
    : sortOptions((optionsRes.data ?? []) as OptionFlat[]);
  const usage: Record<string, number> = {};
  for (const u of (usageRes.data ?? []) as { option_id: string; nb_ventes: number }[]) {
    usage[u.option_id] = Number(u.nb_ventes ?? 0);
  }

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
          <BaremeForm
            sousTypes={sousTypes}
            paliers={paliers}
            options={options}
            usage={usage}
          />
        </div>
      </div>
    </div>
  );
}

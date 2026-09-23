import ModeleForm from "@/components/ModeleForm";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ModeleTelephone } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminModelesPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("modeles_telephones")
    .select("*")
    .eq("shop_id", admin.shop_id)
    .order("marque")
    .order("nom");

  const modeles = (data ?? []) as ModeleTelephone[];

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-white">
          Catalogue des modèles de téléphones
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Ces modèles alimentent le choix de sous-produit du formulaire de
          vente Téléphones. Le montant de base par modèle prime sur le
          barème générique de l&apos;acte.
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Table introuvable — exécutez
            migrations/006_modeles_telephones_options.sql. {error.message}
          </p>
        )}

        <div className="mt-4">
          <ModeleForm modeles={modeles} />
        </div>
      </div>
    </div>
  );
}

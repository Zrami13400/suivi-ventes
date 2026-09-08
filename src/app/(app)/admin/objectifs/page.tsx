import ObjectifForm from "@/components/ObjectifForm";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Objectif, Profile } from "@/lib/types";
import { deleteObjectif } from "../actions";

export const dynamic = "force-dynamic";

const PERIODE_LABEL: Record<string, string> = {
  jour: "Jour",
  semaine: "Semaine",
  mois: "Mois",
};

export default async function AdminObjectifsPage() {
  const admin = await requireAdmin();
  const supabase = createClient();

  const [vendeursRes, objectifsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nom_complet, role")
      .eq("shop_id", admin.shop_id)
      .order("nom_complet"),
    supabase
      .from("objectifs")
      .select("*")
      .eq("shop_id", admin.shop_id)
      .order("date_debut", { ascending: false }),
  ]);

  const vendeurs = ((vendeursRes.data ?? []) as Profile[])
    .filter((p) => p.role === "vendeur")
    .map((p) => ({ id: p.id, nom_complet: p.nom_complet }));
  const objectifs = (objectifsRes.data ?? []) as Objectif[];
  const vendeurName = new Map(vendeurs.map((v) => [v.id, v.nom_complet]));

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-white">Nouvel objectif</h2>
        <p className="mt-1 text-sm text-slate-400">
          Cible exprimée en nombre d&apos;actes. Laissez « Toute la boutique »
          pour un objectif collectif.
        </p>
        <div className="mt-4">
          <ObjectifForm vendeurs={vendeurs} />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <h2 className="border-b border-line px-6 py-4 text-sm font-semibold text-white">
          Objectifs existants ({objectifs.length})
        </h2>
        {objectifs.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">Aucun objectif défini.</p>
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Période</th>
                  <th className="px-4 py-2 font-medium">Cible</th>
                  <th className="px-4 py-2 font-medium">Dates</th>
                  <th className="px-4 py-2 font-medium">Actes cible</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {objectifs.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2 text-white">
                      {PERIODE_LABEL[o.periode] ?? o.periode}
                    </td>
                    <td className="px-4 py-2 text-slate-300">
                      {o.vendeur_id
                        ? vendeurName.get(o.vendeur_id) ?? "Vendeur"
                        : "Toute la boutique"}
                    </td>
                    <td className="px-4 py-2 text-slate-400">
                      {formatDate(o.date_debut)} – {formatDate(o.date_fin)}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-white">
                      {o.nb_ventes_cible}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <form action={deleteObjectif}>
                        <input type="hidden" name="id" value={o.id} />
                        <button
                          type="submit"
                          className="text-xs font-medium text-rose-400 hover:text-rose-300"
                        >
                          Supprimer
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

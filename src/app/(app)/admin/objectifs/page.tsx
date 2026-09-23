import ObjectifForm from "@/components/ObjectifForm";
import { ACTE_A_TAUX } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { joursTravailles } from "@/lib/planning";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Objectif, Planning, Profile } from "@/lib/types";
import { deleteObjectif, updateObjectifValeur } from "../actions";

export const dynamic = "force-dynamic";

const PERIODE_LABEL: Record<string, string> = {
  jour: "Jour",
  semaine: "Semaine",
  mois: "Mois",
};

export default async function AdminObjectifsPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const [vendeursRes, objectifsRes, planningRes] = await Promise.all([
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
    supabase.from("planning").select("*").eq("shop_id", admin.shop_id),
  ]);

  const vendeurs = ((vendeursRes.data ?? []) as Profile[])
    .filter((p) => p.role === "vendeur")
    .map((p) => ({ id: p.id, nom_complet: p.nom_complet }));
  const objectifs = (objectifsRes.data ?? []) as Objectif[];
  const planning = (planningRes.data ?? []) as Planning[];

  const groups: { label: string; rows: Objectif[] }[] = [
    { label: "Boutique", rows: objectifs.filter((o) => o.vendeur_id === null) },
    ...vendeurs.map((v) => ({
      label: v.nom_complet,
      rows: objectifs.filter((o) => o.vendeur_id === v.id),
    })),
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-white">Nouvel objectif</h2>
        <p className="mt-1 text-sm text-slate-400">
          Volumétrie (nombre d&apos;actes) et/ou taux d&apos;attachement (%),
          pour la boutique ou un conseiller.
        </p>
        <div className="mt-4">
          <ObjectifForm vendeurs={vendeurs} />
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="card p-6 text-sm text-slate-400">Aucun objectif défini.</p>
      ) : (
        groups.map((g) => (
          <div key={g.label} className="card overflow-hidden p-0">
            <h2 className="border-b border-line px-6 py-4 text-sm font-semibold text-white">
              {g.label} ({g.rows.length})
            </h2>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Type d&apos;acte</th>
                    <th className="px-4 py-2 font-medium">Cible</th>
                    <th className="px-4 py-2 font-medium">Période</th>
                    <th className="px-4 py-2 font-medium">Dates</th>
                    {g.label !== "Boutique" && (
                      <th className="px-4 py-2 font-medium">Jours travaillés</th>
                    )}
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {g.rows.map((o) => {
                    const jt =
                      o.vendeur_id &&
                      joursTravailles(
                        planning.filter((p) => p.vendeur_id === o.vendeur_id),
                        o.date_debut,
                        o.date_fin,
                      );
                    return (
                      <tr key={o.id}>
                        <td className="px-4 py-2 text-white">
                          {o.acte_type ?? "Global"}
                          {o.acte_type && ACTE_A_TAUX[o.acte_type] && (
                            <span className="ml-1 text-xs text-slate-500">
                              ({o.type_cible === "taux" ? "taux" : "volume"})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <form
                            action={updateObjectifValeur}
                            className="flex items-center gap-1.5"
                          >
                            <input type="hidden" name="id" value={o.id} />
                            <input
                              name="valeur_cible"
                              type="number"
                              step="1"
                              min="0"
                              defaultValue={o.valeur_cible ?? o.nb_ventes_cible ?? 0}
                              className="field w-20 py-1"
                            />
                            <span className="text-slate-500">
                              {o.type_cible === "taux" ? "%" : "actes"}
                            </span>
                            <button
                              type="submit"
                              className="text-xs font-medium text-brand-soft hover:underline"
                            >
                              ✓
                            </button>
                          </form>
                        </td>
                        <td className="px-4 py-2 text-slate-300">
                          {PERIODE_LABEL[o.periode] ?? o.periode}
                        </td>
                        <td className="px-4 py-2 text-slate-500">
                          {formatDate(o.date_debut)} – {formatDate(o.date_fin)}
                        </td>
                        {g.label !== "Boutique" && (
                          <td className="px-4 py-2 tabular-nums text-white">
                            {jt ?? "—"}
                          </td>
                        )}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

import Link from "next/link";
import { AnnulerVenteButton } from "@/components/AnnulerVenteButton";
import { MonthSelector } from "@/components/MonthSelector";
import { Card, EmptyState, SectionTitle, cx } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { currentMonth, monthLabel, monthRange } from "@/lib/format";
import { categoryForActe } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ModeleTelephone, Profile, SousTypeActe, Vente } from "@/lib/types";

export const dynamic = "force-dynamic";

const fmt = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Paris",
      })
    : "—";

export default async function AdminAnnulationsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ mois?: string; vendeur?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const admin = await requireAdmin();
  const mois = /^\d{4}-\d{2}$/.test(searchParams.mois ?? "")
    ? (searchParams.mois as string)
    : currentMonth();
  const range = monthRange(mois);
  const supabase = await createClient();

  const [ventesRes, profilesRes, sousTypesRes, modelesRes] = await Promise.all([
    supabase
      .from("ventes")
      .select("*")
      .eq("shop_id", admin.shop_id)
      .gte("created_at", range.start)
      .lt("created_at", range.end)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("*").eq("shop_id", admin.shop_id).order("nom_complet"),
    supabase.from("sous_types_actes").select("id, nom").eq("shop_id", admin.shop_id),
    supabase.from("modeles_telephones").select("id, marque, nom").eq("shop_id", admin.shop_id),
  ]);

  const ventes = (ventesRes.data ?? []) as Vente[];
  const profiles = (profilesRes.data ?? []) as Profile[];
  const nomDe = new Map(profiles.map((p) => [p.id, p.nom_complet]));
  const sousTypes = new Map(
    ((sousTypesRes.data ?? []) as Pick<SousTypeActe, "id" | "nom">[]).map((s) => [s.id, s.nom]),
  );
  const modeles = new Map(
    ((modelesRes.data ?? []) as Pick<ModeleTelephone, "id" | "marque" | "nom">[]).map((m) => [
      m.id,
      `${m.marque} ${m.nom}`.trim(),
    ]),
  );
  const produit = (v: Vente) =>
    (v.modele_id && modeles.get(v.modele_id)) ||
    (v.sous_type_id && sousTypes.get(v.sous_type_id)) ||
    null;

  const annulees = ventes
    .filter((v) => v.statut === "annulée")
    .sort((a, b) => (b.annulee_le ?? "").localeCompare(a.annulee_le ?? ""));

  const sellers = profiles.filter((p) => p.role === "vendeur");
  const vendeurId = sellers.some((s) => s.id === searchParams.vendeur)
    ? (searchParams.vendeur as string)
    : null;
  const validees = ventes.filter(
    (v) => v.statut !== "annulée" && (!vendeurId || v.vendeur_id === vendeurId),
  );
  const hrefVendeur = (id: string | null) => {
    const q = new URLSearchParams({ mois });
    if (id) q.set("vendeur", id);
    return `/admin/annulations?${q.toString()}`;
  };

  return (
    <div className="space-y-8">
      <SectionTitle action={<MonthSelector value={mois} />}>
        Ventes annulées — {monthLabel(mois)}
      </SectionTitle>

      {ventesRes.error && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Ventes indisponibles ({ventesRes.error.message}). Exécutez la migration{" "}
          <code>008_statut_ventes.sql</code>.
        </p>
      )}

      {annulees.length === 0 ? (
        <EmptyState>Aucune vente annulée sur ce mois.</EmptyState>
      ) : (
        <Card className="p-0">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Vendeur</th>
                  <th className="px-4 py-3 font-medium">Vente du</th>
                  <th className="px-4 py-3 font-medium">Acte</th>
                  <th className="px-4 py-3 text-right font-medium">Qté</th>
                  <th className="px-4 py-3 font-medium">Motif</th>
                  <th className="px-4 py-3 font-medium">Annulée par</th>
                  <th className="px-4 py-3 font-medium">Le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {annulees.map((v) => (
                  <tr key={v.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-white">
                      {nomDe.get(v.vendeur_id) ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">
                      {fmt(v.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cx("font-semibold", categoryForActe(v.acte_type)?.accent)}>
                        {v.acte_type}
                      </span>
                      {produit(v) && (
                        <span className="block text-xs text-slate-500">{produit(v)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white">{v.quantity}</td>
                    <td className="px-4 py-2.5 text-slate-300">
                      {v.motif_annulation ?? <span className="text-slate-600">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                      {(v.annulee_par && nomDe.get(v.annulee_par)) ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">
                      {fmt(v.annulee_le)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div>
        <SectionTitle>Annuler une vente</SectionTitle>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[{ id: null, nom_complet: "Tous" }, ...sellers].map((s) => (
            <Link
              key={s.id ?? "tous"}
              href={hrefVendeur(s.id)}
              scroll={false}
              className={cx(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                vendeurId === s.id
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-surface-strong text-slate-400 hover:text-white",
              )}
            >
              {s.nom_complet}
            </Link>
          ))}
        </div>
        {validees.length === 0 ? (
          <EmptyState>Aucune vente validée sur ce mois.</EmptyState>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-line/60">
              {validees.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-24 shrink-0 text-slate-400">{fmt(v.created_at)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-white">{nomDe.get(v.vendeur_id) ?? "—"}</span>
                    <span className="text-slate-500"> · </span>
                    <span className={categoryForActe(v.acte_type)?.accent}>{v.acte_type}</span>
                    {produit(v) && <span className="text-slate-500"> · {produit(v)}</span>}
                    <span className="text-slate-500"> × {v.quantity}</span>
                  </span>
                  <AnnulerVenteButton
                    venteId={v.id}
                    resume={`${nomDe.get(v.vendeur_id) ?? ""} — ${produit(v) ?? v.acte_type} × ${v.quantity}`}
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

import { Tabs } from "@/components/Tabs";
import { Card, EmptyState, ProgressBar, SectionTitle } from "@/components/ui";
import { getCurrentProfileOrNull } from "@/lib/auth";
import { currentMonth, formatMoney, monthLabel, pct, todayISO } from "@/lib/format";
import {
  actesParCategorie,
  totalActes,
  totalCommission,
} from "@/lib/kpi";
import { CATEGORIES } from "@/lib/constants";
import { loadShopMonth } from "@/lib/shop-month";
import type { Objectif } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ObjectifsPage() {
  const profile = await getCurrentProfileOrNull();
  if (!profile) return null;

  const today = todayISO();
  const mois = currentMonth();
  const sm = await loadShopMonth(profile.shop_id, mois);

  const moisObjs = sm.objectifs.filter(
    (o) => o.periode === "mois" && o.date_debut <= today && o.date_fin >= today,
  );
  const boutiqueObj = moisObjs.find((o) => o.vendeur_id === null) ?? null;

  const realiseBoutique = totalActes(sm.ventes);
  const caBoutique = totalCommission(sm.ventes, sm.regles);
  const cat = actesParCategorie(sm.ventes);
  const totCat = cat.freebox + cat.forfaits + cat.telephones || 1;
  const mcafeeCount = sm.ventes
    .filter((v) => v.acte_type === "Freebox" && v.has_mcafee)
    .reduce((s, v) => s + v.quantity, 0);
  const mcafeeRate = cat.freebox > 0 ? mcafeeCount / cat.freebox : 0;

  const boutiqueTab = (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Objectif du mois
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-white">
            {boutiqueObj ? `${boutiqueObj.nb_ventes_cible}` : "—"}
            <span className="ml-1 text-sm font-normal text-slate-400">actes</span>
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Réalisé
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-white">
            {realiseBoutique}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            CA commission estimé
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-amber-300">
            {formatMoney(caBoutique)}
          </p>
        </Card>
      </div>

      {boutiqueObj && (
        <Card>
          <div className="flex justify-between text-sm text-slate-300">
            <span>Progression boutique</span>
            <span className="font-semibold text-white">
              {pct(realiseBoutique, boutiqueObj.nb_ventes_cible)}%
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar
              value={pct(realiseBoutique, boutiqueObj.nb_ventes_cible)}
              tone="violet"
            />
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle>Répartition par catégorie</SectionTitle>
        <div className="space-y-4">
          {CATEGORIES.map((c) => {
            const val = cat[c.key];
            const share = Math.round((val / totCat) * 100);
            return (
              <div key={c.key}>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">{c.label}</span>
                  <span className="font-medium tabular-nums text-white">
                    {val} actes · {share}%
                  </span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar
                    value={share}
                    tone={
                      c.key === "freebox"
                        ? "violet"
                        : c.key === "forfaits"
                          ? "sky"
                          : "emerald"
                    }
                  />
                </div>
              </div>
            );
          })}
          <div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">McAfee (taux d&apos;attache Box)</span>
              <span className="font-medium tabular-nums text-white">
                {Math.round(mcafeeRate * 100)}%
              </span>
            </div>
            <div className="mt-1.5">
              <ProgressBar value={mcafeeRate * 100} tone="amber" />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );

  const conseillerTab = (
    <ConseillerTab
      sm={sm}
      moisObjs={moisObjs}
      selfId={profile.id}
    />
  );

  return (
    <div className="space-y-4">
      <SectionTitle>Objectifs — {monthLabel(mois)}</SectionTitle>
      <Tabs
        tabs={[
          { id: "boutique", label: "Boutique", content: boutiqueTab },
          { id: "conseiller", label: "Conseiller", content: conseillerTab },
        ]}
      />
    </div>
  );
}

function ConseillerTab({
  sm,
  moisObjs,
  selfId,
}: {
  sm: Awaited<ReturnType<typeof loadShopMonth>>;
  moisObjs: Objectif[];
  selfId: string;
}) {
  const rows = sm.ranking.map((r) => {
    const obj = moisObjs.find((o) => o.vendeur_id === r.vendeur.id) ?? null;
    return { r, cible: obj?.nb_ventes_cible ?? null };
  });

  if (rows.length === 0) {
    return <EmptyState>Aucun vendeur dans la boutique.</EmptyState>;
  }

  return (
    <div className="space-y-3">
      {rows.map(({ r, cible }) => {
        const p = cible ? pct(r.actes, cible) : 0;
        return (
          <Card
            key={r.vendeur.id}
            className={r.vendeur.id === selfId ? "ring-1 ring-brand/40" : ""}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-white">
                  {r.vendeur.nom_complet}
                  {r.vendeur.id === selfId && (
                    <span className="ml-2 text-xs text-brand-soft">(moi)</span>
                  )}
                </p>
                <p className="text-xs text-slate-400">
                  {r.joursActifs} jour(s) travaillé(s) · Niveau {r.niveau}
                </p>
              </div>
              <p className="text-sm tabular-nums text-slate-300">
                <span className="font-semibold text-white">{r.actes}</span> /{" "}
                {cible ?? "—"} actes
              </p>
            </div>
            <div className="mt-3">
              <ProgressBar value={p} />
            </div>
            <p className="mt-1 text-right text-xs text-slate-500">
              {cible ? `${p}%` : "Pas d'objectif individuel"}
            </p>
          </Card>
        );
      })}
    </div>
  );
}

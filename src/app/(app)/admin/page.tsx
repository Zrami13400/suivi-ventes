import { MonthSelector } from "@/components/MonthSelector";
import { RankingTable } from "@/components/RankingTable";
import { Card, EmptyState, ProgressBar, SectionTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { currentMonth, formatMoney, monthLabel, pct, todayISO } from "@/lib/format";
import {
  objectifBoutiqueJour,
  totalActes,
  totalCommission,
} from "@/lib/kpi";
import { loadShopMonth } from "@/lib/shop-month";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: { mois?: string };
}) {
  const admin = await requireAdmin();
  const mois = /^\d{4}-\d{2}$/.test(searchParams.mois ?? "")
    ? (searchParams.mois as string)
    : currentMonth();

  const today = todayISO();
  const sm = await loadShopMonth(admin.shop_id, mois);

  const ventesToday = sm.ventes.filter((v) => v.created_at.slice(0, 10) === today);
  const moisObj =
    sm.objectifs.find(
      (o) =>
        o.periode === "mois" &&
        o.vendeur_id === null &&
        o.date_debut <= today &&
        o.date_fin >= today,
    )?.nb_ventes_cible ?? null;

  const realiseMois = totalActes(sm.ventes);
  const primesMois = sm.ranking.reduce((s, r) => s + r.prime, 0);

  return (
    <div className="space-y-6">
      <SectionTitle action={<MonthSelector value={mois} />}>
        Vue d&apos;ensemble — {monthLabel(mois)}
      </SectionTitle>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Vendeurs</p>
          <p className="mt-2 text-2xl font-bold text-white">{sm.sellers.length}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Actes du mois
          </p>
          <p className="mt-2 text-2xl font-bold text-white tabular-nums">
            {realiseMois}
            {moisObj ? (
              <span className="ml-1 text-sm font-normal text-slate-400">
                / {moisObj}
              </span>
            ) : null}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Primes du mois (total)
          </p>
          <p className="mt-2 text-2xl font-bold text-amber-300 tabular-nums">
            {formatMoney(primesMois)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            CA commission (mois)
          </p>
          <p className="mt-2 text-2xl font-bold text-white tabular-nums">
            {formatMoney(totalCommission(sm.ventes, sm.regles))}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Objectif boutique aujourd&apos;hui
          </p>
          <p className="mt-2 text-xl font-bold text-white tabular-nums">
            {totalActes(ventesToday)} / {objectifBoutiqueJour(sm.objectifs, today) || "—"}
          </p>
          <div className="mt-2">
            <ProgressBar
              value={pct(
                totalActes(ventesToday),
                objectifBoutiqueJour(sm.objectifs, today),
              )}
              tone="violet"
            />
          </div>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            CA du jour (commission)
          </p>
          <p className="mt-2 text-xl font-bold text-amber-300 tabular-nums">
            {formatMoney(totalCommission(ventesToday, sm.regles))}
          </p>
        </Card>
      </div>

      {moisObj && (
        <Card>
          <div className="flex justify-between text-sm text-slate-300">
            <span>Progression boutique — {monthLabel(mois)}</span>
            <span className="font-semibold text-white">
              {pct(realiseMois, moisObj)}%
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar value={pct(realiseMois, moisObj)} tone="violet" />
          </div>
        </Card>
      )}

      <div>
        <SectionTitle>Classement &amp; primes par vendeur</SectionTitle>
        {sm.ranking.length === 0 ? (
          <EmptyState>Aucun vendeur dans cette boutique.</EmptyState>
        ) : (
          <RankingTable rows={sm.ranking} canSeePrimes selfId={admin.id} />
        )}
      </div>
    </div>
  );
}

import { MonthSelector } from "@/components/MonthSelector";
import { RankingTable } from "@/components/RankingTable";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { getCurrentProfileOrNull } from "@/lib/auth";
import { currentMonth, formatMoney, monthLabel } from "@/lib/format";
import { loadShopMonth } from "@/lib/shop-month";

export const dynamic = "force-dynamic";

export default async function ClassementPage({
  searchParams,
}: {
  searchParams: { mois?: string };
}) {
  const profile = await getCurrentProfileOrNull();
  if (!profile) return null;

  const mois = /^\d{4}-\d{2}$/.test(searchParams.mois ?? "")
    ? (searchParams.mois as string)
    : currentMonth();

  const sm = await loadShopMonth(profile.shop_id, mois);
  const canSeePrimes = profile.role === "admin";
  const top = sm.ranking[0];

  const totalActes = sm.ranking.reduce((s, r) => s + r.actes, 0);

  return (
    <div className="space-y-5">
      <SectionTitle action={<MonthSelector value={mois} />}>
        Classement — {monthLabel(mois)}
      </SectionTitle>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Total actes équipe
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-white">
            {totalActes}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Top vendeur
          </p>
          <p className="mt-2 text-lg font-bold text-white">
            {top && top.actes > 0 ? `👑 ${top.vendeur.nom_complet}` : "—"}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {canSeePrimes ? "Primes équipe (total)" : "Primes"}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-amber-300">
            {canSeePrimes
              ? formatMoney(sm.ranking.reduce((s, r) => s + r.prime, 0))
              : "privé"}
          </p>
        </Card>
      </div>

      {!sm.ventesCollectivesOk && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Le classement peut être incomplet : la lecture des ventes de toute la
          boutique semble bloquée par la RLS (voir README).
        </p>
      )}

      {sm.ranking.length === 0 ? (
        <EmptyState>Aucun vendeur à classer.</EmptyState>
      ) : (
        <RankingTable
          rows={sm.ranking}
          canSeePrimes={canSeePrimes}
          selfId={profile.id}
        />
      )}

      {!canSeePrimes && (
        <p className="text-xs text-slate-500">
          Les primes sont individuelles et privées : seul le montant de tes
          propres primes t&apos;est visible (dans « Mon profil »). Les actes,
          eux, sont partagés avec l&apos;équipe.
        </p>
      )}
    </div>
  );
}

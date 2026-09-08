import AccueilClient from "@/components/AccueilClient";
import { ProfilePanel } from "@/components/ProfilePanel";
import { getCurrentProfileOrNull } from "@/lib/auth";
import { todayISO, weekRange } from "@/lib/format";
import {
  categoryMix,
  objectifBoutiqueJour,
  objectifJourVendeur,
  totalActes,
  totalCommission,
} from "@/lib/kpi";
import { loadShopMonth } from "@/lib/shop-month";
import type { PrimeJournaliere } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await getCurrentProfileOrNull();
  if (!profile) return null;

  const today = todayISO();
  const sm = await loadShopMonth(profile.shop_id);

  const ventesToday = sm.ventes.filter((v) => v.created_at.slice(0, 10) === today);
  const ownVentesToday = ventesToday.filter((v) => v.vendeur_id === profile.id);
  const ownPrime =
    (sm.primesByVendeur.get(profile.id) ?? []).find((p) => p.date === today) ??
    null;

  const shop = {
    objectifBoutiqueJour: objectifBoutiqueJour(sm.objectifs, today),
    actesBoutiqueJour: totalActes(ventesToday),
    caBoutiqueJour: totalCommission(ventesToday, sm.regles),
  };
  const sellerDailyTarget = objectifJourVendeur(sm.objectifs, profile.id, today);
  const mix = categoryMix(sm.ventesByVendeur.get(profile.id) ?? sm.ventes);

  const myStats = sm.ranking.find((r) => r.vendeur.id === profile.id) ?? null;
  const myBadges = sm.badges.get(profile.id) ?? [];
  const myPrimesMonth: PrimeJournaliere[] =
    sm.primesByVendeur.get(profile.id) ?? [];

  const wr = weekRange();
  const myWeekVentes = (sm.ventesByVendeur.get(profile.id) ?? []).filter((v) => {
    const t = new Date(v.created_at);
    return t >= wr.start && t < wr.end;
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        {!sm.ventesCollectivesOk && (
          <p className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Les ventes collectives de la boutique ne remontent pas — vérifiez la
            politique RLS de lecture sur <code>ventes</code> (voir README).
          </p>
        )}
        <AccueilClient
          vendeurId={profile.id}
          today={today}
          regles={sm.regles}
          initialVentes={ownVentesToday}
          initialPrime={ownPrime}
          shop={shop}
          sellerDailyTarget={sellerDailyTarget}
          mix={mix}
        />
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <ProfilePanel
          nomComplet={profile.nom_complet}
          stats={myStats}
          badges={myBadges}
          primesMonth={myPrimesMonth}
          range={sm.range}
          weekVentes={myWeekVentes}
          regles={sm.regles}
        />
      </div>
    </div>
  );
}

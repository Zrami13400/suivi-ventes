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
import { joursTravailles } from "@/lib/planning";
import { loadShopMonth } from "@/lib/shop-month";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await getCurrentProfileOrNull();
  if (!profile) return null;

  const today = todayISO();
  const sm = await loadShopMonth(profile.shop_id);

  const ventesToday = sm.ventes.filter((v) => v.created_at.slice(0, 10) === today);
  const ownVentesMonth = sm.ventesByVendeur.get(profile.id) ?? [];
  const myPlanning = sm.planningByVendeur.get(profile.id) ?? [];

  const shop = {
    objectifBoutiqueJour: objectifBoutiqueJour(sm.objectifs, today),
    actesBoutiqueJour: totalActes(ventesToday),
    caBoutiqueJour: totalCommission(ventesToday, sm.priceBook),
  };

  const joursTrav = joursTravailles(
    myPlanning,
    sm.range.start.slice(0, 10),
    today,
  );
  const sellerDailyTarget = objectifJourVendeur(
    sm.objectifs,
    profile.id,
    today,
    joursTrav || null,
  );
  const mix = categoryMix(ownVentesMonth.length ? ownVentesMonth : sm.ventes);

  const myStats = sm.ranking.find((r) => r.vendeur.id === profile.id) ?? null;
  const myBadges = sm.badges.get(profile.id) ?? [];
  const myPrimesJour = sm.primesJourByVendeur.get(profile.id) ?? [];
  const myPrimeMensuelle = sm.primeMensuelleByVendeur.get(profile.id) ?? null;

  const wr = weekRange();
  const myWeekVentes = ownVentesMonth.filter((v) => {
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
        {!sm.primesMensuellesOk && (
          <p className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Migration <code>003_objectifs_planning_paliers.sql</code> non
            exécutée — les primes à paliers et le détail de commission ne sont
            pas encore actifs.
          </p>
        )}
        <AccueilClient
          vendeurId={profile.id}
          today={today}
          moisDate={sm.moisDate}
          regles={sm.regles}
          paliers={sm.paliers}
          sousTypes={sm.sousTypes}
          objectifsBoutiqueMois={sm.objectifsBoutiqueMois}
          initialSellerVentesMois={ownVentesMonth}
          initialShopVentesMois={sm.ventes}
          initialPrimeMensuelle={myPrimeMensuelle}
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
          primesJour={myPrimesJour}
          weekVentes={myWeekVentes}
          priceBook={sm.priceBook}
        />
      </div>
    </div>
  );
}

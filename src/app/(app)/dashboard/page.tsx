import AccueilClient from "@/components/AccueilClient";
import { MobileDashboardShell } from "@/components/mobile/MobileDashboardShell";
import { isDashboardTab } from "@/lib/dashboardTabs";
import { getCurrentProfileOrNull } from "@/lib/auth";
import { currentMonth, monthLabel, todayISO } from "@/lib/format";
import {
  categoryMix,
  breakdownFromPrimeMensuelle,
  computeCommission,
  niveauPourActes,
  objectifJourVendeur,
  objectifVolumeJour,
  totalActes,
  type CommissionBreakdown as Breakdown,
} from "@/lib/kpi";
import { joursTravailles, presenceStreak } from "@/lib/planning";
import { loadShopMonth } from "@/lib/shop-month";
import { createClient } from "@/lib/supabase/server";
import type { Vente } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const profile = await getCurrentProfileOrNull();
  if (!profile) return null;

  const today = todayISO();
  const mois = currentMonth();
  const sm = await loadShopMonth(profile.shop_id, mois);

  const ownVentesMonth = sm.ventesByVendeur.get(profile.id) ?? [];
  const myPlanning = sm.planningByVendeur.get(profile.id) ?? [];

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

  const dailyTargetMcafee = objectifVolumeJour(sm.objectifs, "McAfee", today, {
    vendeurId: profile.id,
    joursTravailles: joursTrav || null,
  });
  const dailyTargetAssurance = objectifVolumeJour(
    sm.objectifs,
    "Assurance",
    today,
    { vendeurId: profile.id, joursTravailles: joursTrav || null },
  );

  const myStats = sm.ranking.find((r) => r.vendeur.id === profile.id) ?? null;
  const myPrimeMensuelle = sm.primeMensuelleByVendeur.get(profile.id) ?? null;
  const presenceStreakDays = presenceStreak(myPlanning, today);
  const teammates = sm.sellers.map((s) => ({ id: s.id, nom_complet: s.nom_complet }));

  // --- Données additionnelles pour le shell mobile (5 onglets) -----------
  const initialTab = isDashboardTab(searchParams.tab) ? searchParams.tab : "accueil";

  const supabase = createClient();
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 1, 0, 1);
  const { data: extRows } = await supabase
    .from("ventes")
    .select("*")
    .eq("vendeur_id", profile.id)
    .gte("created_at", twoYearsAgo.toISOString())
    .order("created_at", { ascending: false });
  const sellerVentesExtended = (extRows ?? []) as Vente[];

  const primesJourMine = sm.primesJourByVendeur.get(profile.id) ?? [];
  const last7 = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const iso = d.toISOString().slice(0, 10);
    const row = primesJourMine.find((p) => p.date === iso);
    return { iso, prime: Number(row?.prime_calculee ?? 0) };
  });

  const targets: Record<string, number> = {};
  for (const s of sm.sellers) {
    const pl = sm.planningByVendeur.get(s.id) ?? [];
    const jt = joursTravailles(pl, sm.range.start.slice(0, 10), today);
    const dailyT = objectifJourVendeur(sm.objectifs, s.id, today, jt || null);
    targets[s.id] = Math.round(dailyT * (jt || 26));
  }
  const actesMoisPrecedent = Object.fromEntries(sm.actesMoisPrecedent);

  const primeComputed = computeCommission(ownVentesMonth, sm.ventes, {
    priceBook: sm.priceBook,
    paliers: sm.paliers,
    objectifsBoutiqueMois: sm.objectifsBoutiqueMois,
  });
  const primeBreakdown: Breakdown = myPrimeMensuelle
    ? breakdownFromPrimeMensuelle(myPrimeMensuelle)
    : primeComputed;

  const niveauLabel = niveauPourActes(totalActes(ownVentesMonth)).label;

  return (
    <div className="space-y-6">
      {!sm.ventesCollectivesOk && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Les ventes collectives de la boutique ne remontent pas — vérifiez la
          politique RLS de lecture sur <code>ventes</code> (voir README).
        </p>
      )}
      {!sm.primesMensuellesOk && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Migration <code>003_objectifs_planning_paliers.sql</code> non
          exécutée — les primes à paliers et le détail de commission ne sont
          pas encore actifs.
        </p>
      )}

      <div className="hidden lg:block">
        <AccueilClient
          vendeurId={profile.id}
          nomComplet={profile.nom_complet}
          avatarUrl={profile.avatar_url}
          role={profile.role}
          shopId={profile.shop_id}
          today={today}
          moisDate={sm.moisDate}
          regles={sm.regles}
          paliers={sm.paliers}
          sousTypes={sm.sousTypes}
          modeles={sm.modeles}
          options={sm.options}
          objectifs={sm.objectifs}
          objectifsBoutiqueMois={sm.objectifsBoutiqueMois}
          initialSellerVentesMois={ownVentesMonth}
          initialShopVentesMois={sm.ventes}
          initialPrimeMensuelle={myPrimeMensuelle}
          sellerDailyTarget={sellerDailyTarget}
          mix={mix}
          dailyTargetMcafee={dailyTargetMcafee}
          dailyTargetAssurance={dailyTargetAssurance}
          presenceStreakDays={presenceStreakDays}
          rang={myStats?.rang ?? null}
          totalSellers={sm.sellers.length}
          teammates={teammates}
        />
      </div>

      <MobileDashboardShell
        initialTab={initialTab}
        accueil={{
          vendeurId: profile.id,
          nomComplet: profile.nom_complet,
          avatarUrl: profile.avatar_url,
          role: profile.role,
          shopId: profile.shop_id,
          today,
          moisDate: sm.moisDate,
          regles: sm.regles,
          paliers: sm.paliers,
          sousTypes: sm.sousTypes,
          modeles: sm.modeles,
          options: sm.options,
          objectifs: sm.objectifs,
          objectifsBoutiqueMois: sm.objectifsBoutiqueMois,
          initialSellerVentesMois: ownVentesMonth,
          initialShopVentesMois: sm.ventes,
          initialPrimeMensuelle: myPrimeMensuelle,
          sellerDailyTarget,
          mix,
          dailyTargetMcafee,
          dailyTargetAssurance,
          rang: myStats?.rang ?? null,
          totalSellers: sm.sellers.length,
          teammates,
        }}
        stats={{ sellerVentes: sellerVentesExtended, last7 }}
        equipe={{
          rows: sm.ranking,
          targets,
          actesMoisPrecedent,
          selfId: profile.id,
          canSeePrimes: profile.role === "admin",
        }}
        prime={{ data: primeBreakdown, monthLabel: monthLabel(mois) }}
        plus={{
          role: profile.role,
          nomComplet: profile.nom_complet,
          avatarUrl: profile.avatar_url,
          niveauLabel,
        }}
      />
    </div>
  );
}

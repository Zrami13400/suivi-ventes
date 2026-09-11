import { Card, ProgressBar, SectionTitle, Avatar } from "@/components/ui";
import { getCurrentProfileOrNull } from "@/lib/auth";
import {
  currentMonth,
  formatMoney,
  monthLabel,
  pct,
  weekRange,
} from "@/lib/format";
import {
  actesParCategorie,
  computeCommission,
  niveauPourActes,
  prochainNiveau,
  totalActes,
  type CommissionBreakdown as Breakdown,
} from "@/lib/kpi";
import { BADGES, NIVEAUX } from "@/lib/constants";
import { CommissionBreakdown } from "@/components/CommissionBreakdown";
import { joursTravailles } from "@/lib/planning";
import { loadShopMonth } from "@/lib/shop-month";

export const dynamic = "force-dynamic";

/** Série de jours consécutifs (jusqu'à aujourd'hui) avec au moins un acte. */
function streak(dates: Set<string>): number {
  let n = 0;
  const d = new Date();
  for (let i = 0; i < 60; i++) {
    const iso = d.toISOString().slice(0, 10);
    if (dates.has(iso)) n++;
    else if (i > 0) break; // aujourd'hui sans vente : la série peut être 0
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export default async function ProfilPage() {
  const profile = await getCurrentProfileOrNull();
  if (!profile) return null;

  const mois = currentMonth();
  const sm = await loadShopMonth(profile.shop_id, mois);
  const mine = sm.ventesByVendeur.get(profile.id) ?? [];
  const primesJour = sm.primesJourByVendeur.get(profile.id) ?? [];
  const stats = sm.ranking.find((r) => r.vendeur.id === profile.id);
  const badges = sm.badges.get(profile.id) ?? [];
  const myPlanning = sm.planningByVendeur.get(profile.id) ?? [];

  const actesMois = totalActes(mine);
  const niv = niveauPourActes(actesMois);
  const next = prochainNiveau(actesMois);
  const nivPct = next
    ? pct(actesMois - niv.min, next.min - niv.min)
    : 100;

  const primeMensuelle = sm.primeMensuelleByVendeur.get(profile.id) ?? null;
  const computed = computeCommission(mine, sm.ventes, {
    priceBook: sm.priceBook,
    regles: sm.regles,
    paliers: sm.paliers,
    objectifsBoutiqueMois: sm.objectifsBoutiqueMois,
  });
  const breakdown: Breakdown = primeMensuelle
    ? {
        base: primeMensuelle.prime_base,
        boostIndividuel: primeMensuelle.boost_individuel,
        boostCollectif: primeMensuelle.boost_collectif,
        bonusMcafee: primeMensuelle.bonus_mcafee,
        bonusAssurance: primeMensuelle.bonus_assurance,
        total: primeMensuelle.prime_totale,
        totalActes: primeMensuelle.total_actes,
      }
    : computed;

  const joursTravaillesMois = joursTravailles(
    myPlanning,
    sm.range.start.slice(0, 10),
    sm.range.end.slice(0, 10),
  );

  const { start, end } = weekRange();
  const wStart = start.toISOString().slice(0, 10);
  const wEnd = end.toISOString().slice(0, 10);
  const weekVentes = mine.filter((v) => {
    const d = v.created_at.slice(0, 10);
    return d >= wStart && d < wEnd;
  });
  const weekPrime = primesJour
    .filter((p) => p.date >= wStart && p.date < wEnd)
    .reduce((s, p) => s + Number(p.prime_calculee ?? 0), 0);

  const days = new Set(mine.map((v) => v.created_at.slice(0, 10)));
  const currentStreak = streak(days);

  const last7 = [...Array(7)]
    .map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const iso = d.toISOString().slice(0, 10);
      const row = primesJour.find((p) => p.date === iso);
      return { iso, prime: Number(row?.prime_calculee ?? 0), actes: Number(row?.total_ventes ?? 0) };
    });
  const max7 = Math.max(1, ...last7.map((d) => d.prime));

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center gap-4">
        <Avatar name={profile.nom_complet} size={64} />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white">{profile.nom_complet}</h1>
          <p className="text-sm text-slate-400">
            Vendeur · Niveau {niv.niveau} — {niv.label}
          </p>
        </div>
        <div className="ml-auto flex gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-white tabular-nums">
              {actesMois}
            </p>
            <p className="text-xs text-slate-400">actes ce mois</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-300 tabular-nums">
              {currentStreak}
            </p>
            <p className="text-xs text-slate-400">jours de série 🔥</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white tabular-nums">
              #{stats?.rang ?? "—"}
            </p>
            <p className="text-xs text-slate-400">au classement</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Niveau {niv.niveau} — {niv.label}</SectionTitle>
          <ProgressBar value={nivPct} tone="violet" />
          <p className="mt-2 text-sm text-slate-400">
            {next
              ? `${next.min - actesMois} actes avant le niveau ${next.niveau} (${next.label})`
              : "Niveau maximum atteint 🎉"}
          </p>
          <div className="mt-4 flex justify-between gap-1">
            {NIVEAUX.map((n) => (
              <div
                key={n.niveau}
                className={`flex-1 rounded-md px-1 py-2 text-center text-xs ${
                  n.niveau <= niv.niveau
                    ? "bg-brand/20 text-brand-soft"
                    : "bg-surface-strong text-slate-500"
                }`}
              >
                Niv {n.niveau}
                <span className="block text-[10px]">≥ {n.min}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>Cette semaine</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Actes" value={totalActes(weekVentes)} />
            <Metric label="Primes" value={formatMoney(weekPrime)} accent />
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <Line label="Freebox" value={actesParCategorie(weekVentes).freebox} />
            <Line label="Forfaits" value={actesParCategorie(weekVentes).forfaits} />
            <Line label="Téléphones" value={actesParCategorie(weekVentes).telephones} />
          </dl>
        </Card>
      </div>

      <CommissionBreakdown
        data={breakdown}
        title={`Mes primes — ${monthLabel(mois)}`}
      />
      <p className="-mt-4 text-xs text-slate-500">
        {joursTravaillesMois} jour(s) travaillé(s) ce mois (planning).
      </p>

      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          7 derniers jours (prime de base, hors boosts mensuels)
        </p>
        <div className="mt-2 flex items-end gap-2">
          {last7.map((d) => (
            <div key={d.iso} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-gradient-to-t from-brand/40 to-brand-soft"
                style={{ height: `${8 + (d.prime / max7) * 72}px` }}
                title={`${d.iso} — ${formatMoney(d.prime)} · ${d.actes} actes`}
              />
              <span className="text-[10px] text-slate-500">
                {new Date(d.iso).toLocaleDateString("fr-FR", { weekday: "narrow" })}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Badges du mois</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(BADGES) as (keyof typeof BADGES)[]).map((k) => {
            const earned = badges.includes(k);
            return (
              <div
                key={k}
                className={`rounded-lg border p-3 ${
                  earned
                    ? "border-brand/40 bg-brand/10"
                    : "border-line bg-surface-strong opacity-60"
                }`}
              >
                <p className="text-sm font-semibold text-white">
                  <span aria-hidden className="mr-1">
                    {BADGES[k].emoji}
                  </span>
                  {BADGES[k].label}
                </p>
                <p className="mt-1 text-xs text-slate-400">{BADGES[k].desc}</p>
                <p className="mt-2 text-xs font-medium">
                  {earned ? (
                    <span className="text-emerald-300">Obtenu ✓</span>
                  ) : (
                    <span className="text-slate-500">Pas encore</span>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      <p className="text-xs text-slate-500">
        Le détail de tes primes n&apos;est visible que par toi et par
        l&apos;administrateur de la boutique.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-strong p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p
        className={`mt-0.5 text-lg font-bold tabular-nums ${
          accent ? "text-amber-300" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium tabular-nums text-white">{value}</dd>
    </div>
  );
}

import SaleForm from "@/components/SaleForm";
import { Card, EmptyState, ProgressBar, SectionTitle, cx } from "@/components/ui";
import { getCurrentProfileOrNull } from "@/lib/auth";
import {
  currentMonth,
  formatMoney,
  monthLabel,
  pct,
  todayISO,
} from "@/lib/format";
import {
  actesParCategorie,
  categoryMix,
  ligneCommission,
  objectifJourParCategorie,
  objectifJourVendeur,
  totalActes,
} from "@/lib/kpi";
import { CATEGORIES } from "@/lib/constants";
import { joursTravailles } from "@/lib/planning";
import { loadShopMonth } from "@/lib/shop-month";

export const dynamic = "force-dynamic";

export default async function VentesPage() {
  const profile = await getCurrentProfileOrNull();
  if (!profile) return null;

  const today = todayISO();
  const mois = currentMonth();
  const sm = await loadShopMonth(profile.shop_id, mois);

  const mine = sm.ventesByVendeur.get(profile.id) ?? [];
  const mineToday = mine.filter((v) => v.created_at.slice(0, 10) === today);

  const catMonth = actesParCategorie(mine);
  const catToday = actesParCategorie(mineToday);
  const myPlanning = sm.planningByVendeur.get(profile.id) ?? [];
  const joursTrav = joursTravailles(
    myPlanning,
    sm.range.start.slice(0, 10),
    today,
  );
  const dailyTarget = objectifJourVendeur(
    sm.objectifs,
    profile.id,
    today,
    joursTrav || null,
  );
  const objCat = objectifJourParCategorie(dailyTarget, categoryMix(mine));
  const pb = sm.priceBook;

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle>Enregistrer un acte</SectionTitle>
        <SaleForm sousTypes={sm.sousTypes} />
      </Card>

      <div>
        <SectionTitle>Objectifs par catégorie — {monthLabel(mois)}</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-3">
          {CATEGORIES.map((c) => {
            const realiseJour = catToday[c.key];
            const cibleJour = objCat[c.key];
            const p = pct(realiseJour, cibleJour);
            return (
              <Card key={c.key} className="overflow-hidden">
                <div className={cx("-m-5 mb-4 p-4 text-white", c.grad)}>
                  <p className="text-sm font-semibold uppercase tracking-wide">
                    {c.label}
                  </p>
                  <div className="mt-2 flex items-end gap-4 text-sm">
                    <span>
                      <span className="block text-xs opacity-80">Objectif jour</span>
                      <span className="text-xl font-bold tabular-nums">
                        {cibleJour || "—"}
                      </span>
                    </span>
                    <span>
                      <span className="block text-xs opacity-80">Réalisé</span>
                      <span className="text-xl font-bold tabular-nums">
                        {realiseJour}
                      </span>
                    </span>
                    <span className="ml-auto text-2xl font-bold">{p}%</span>
                  </div>
                </div>
                <ProgressBar value={p} />
                <p className="mt-3 text-sm text-slate-400">
                  Ce mois : <span className="font-semibold text-white">{catMonth[c.key]}</span> actes
                </p>
                <ul className="mt-3 space-y-1 text-xs text-slate-400">
                  {c.sousTypes.map((s) => (
                    <li key={s}>• {s}</li>
                  ))}
                  {c.options.map((o) => (
                    <li key={o} className="text-brand-soft">◦ Option : {o}</li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <SectionTitle>Mes actes du jour ({totalActes(mineToday)})</SectionTitle>
        <Card className="p-0">
          {mineToday.length === 0 ? (
            <div className="p-5">
              <EmptyState>Aucun acte enregistré aujourd&apos;hui.</EmptyState>
            </div>
          ) : (
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Heure</th>
                    <th className="px-4 py-3 font-medium">Catégorie</th>
                    <th className="px-4 py-3 font-medium">Qté</th>
                    <th className="px-4 py-3 font-medium">Options</th>
                    <th className="px-4 py-3 text-right font-medium">Prime base</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {mineToday.map((v) => (
                    <tr key={v.id}>
                      <td className="px-4 py-2.5 text-slate-400">
                        {new Date(v.created_at).toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-white">{v.acte_type}</td>
                      <td className="px-4 py-2.5 tabular-nums text-white">
                        {v.quantity}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {v.has_mcafee && (
                            <span className="chip bg-violet-500/15 text-violet-200">
                              McAfee
                            </span>
                          )}
                          {v.has_assurance && (
                            <span className="chip bg-emerald-500/15 text-emerald-200">
                              Assurance
                            </span>
                          )}
                          {!v.has_mcafee && !v.has_assurance && (
                            <span className="text-slate-600">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-amber-300">
                        {formatMoney(ligneCommission(v, pb))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <p className="mt-2 text-xs text-slate-500">
          « Prime base » = montant du sous-produit + bonus option, hors boosts
          mensuels. Le détail complet (boost individuel / collectif) est sur ton
          tableau de bord. Les primes restent privées ; les actes comptent pour
          le classement.
        </p>
      </div>
    </div>
  );
}

"use client";

import { CheckCircle2, Coins, Plus, Trophy } from "lucide-react";
import { useState } from "react";
import { firstName, formatLongDate, formatMoney, motivation, pct } from "@/lib/format";
import { ligneCommission, mostFrequentActeType, type CatKey } from "@/lib/kpi";
import { CATEGORIES, type ActeType } from "@/lib/constants";
import { useLiveDashboard } from "@/lib/useLiveDashboard";
import type {
  ModeleTelephone,
  OptionFlat,
  Objectif,
  PalierPrime,
  PrimeMensuelle,
  ReglePrime,
  SousTypeActe,
  Vente,
} from "@/lib/types";
import { ActeButton } from "./ActeButton";
import { ActeEntrySheet } from "./ActeEntrySheet";
import { AdminQuickAccess } from "./AdminQuickAccess";
import { Avatar, Card, EmptyState, IconStat, ProgressBar, SectionTitle, cx } from "./ui";
import { AnimatedMoney } from "./ui-client";

interface Props {
  vendeurId: string;
  nomComplet: string;
  avatarUrl: string | null;
  role: string;
  shopId: string;
  today: string;
  moisDate: string;
  regles: ReglePrime[];
  paliers: PalierPrime[];
  sousTypes: SousTypeActe[];
  modeles: ModeleTelephone[];
  options: OptionFlat[] | null;
  /** Objectifs visibles par ce vendeur (boutique + les siens, au minimum). */
  objectifs: Objectif[];
  objectifsBoutiqueMois: Partial<Record<string, number>>;
  initialSellerVentesMois: Vente[];
  initialShopVentesMois: Vente[];
  initialPrimeMensuelle: PrimeMensuelle | null;
  sellerDailyTarget: number;
  mix: Record<CatKey, number>;
  dailyTargetMcafee: number;
  dailyTargetAssurance: number;
  presenceStreakDays: number;
  rang: number | null;
  totalSellers: number;
  teammates: { id: string; nom_complet: string }[];
}

function ordinal(n: number): string {
  return n === 1 ? "er" : "ème";
}

export default function AccueilClient({
  vendeurId,
  nomComplet,
  avatarUrl,
  role,
  shopId,
  today,
  moisDate,
  regles,
  paliers,
  sousTypes,
  modeles,
  options,
  objectifs,
  objectifsBoutiqueMois,
  initialSellerVentesMois,
  initialShopVentesMois,
  initialPrimeMensuelle,
  sellerDailyTarget,
  mix,
  dailyTargetMcafee,
  dailyTargetAssurance,
  presenceStreakDays,
  rang,
  totalSellers,
  teammates,
}: Props) {
  const [actesOpen, setActesOpen] = useState(false);
  const [sheetActe, setSheetActe] = useState<ActeType | null>(null);
  const {
    live,
    toasts,
    setToasts,
    pb,
    sellerVentes,
    breakdownTotal,
    ventesToday,
    ownActesToday,
    defi,
    progressForForm,
  } = useLiveDashboard({
    vendeurId,
    shopId,
    today,
    moisDate,
    regles,
    paliers,
    sousTypes,
    modeles,
    options,
    objectifs,
    objectifsBoutiqueMois,
    initialSellerVentesMois,
    initialShopVentesMois,
    initialPrimeMensuelle,
    sellerDailyTarget,
    mix,
    dailyTargetMcafee,
    dailyTargetAssurance,
    teammates,
  });

  const dateStr = formatLongDate();
  const todayMotivation = motivation(today);
  const classementLabel = rang ? `${rang}${ordinal(rang)} / ${totalSellers}` : "—";

  function pushToast(text: string) {
    setToasts((p) => [...p, { id: `${Date.now()}-${Math.random()}`, text }]);
  }

  return (
    <div className="space-y-6">
      {/* Toasts (achievements équipe + confirmations de vente) */}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto max-w-xs rounded-lg border border-brand/30 bg-surface-strong/95 px-4 py-3 text-sm text-white shadow-glow backdrop-blur"
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* FAB (desktop, pas de barre d'onglets) */}
      <button
        type="button"
        onClick={() => setSheetActe(mostFrequentActeType(sellerVentes))}
        aria-label="Ajouter une vente"
        className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-glow transition hover:bg-brand-soft active:scale-95"
      >
        <Plus className="h-6 w-6" strokeWidth={2.2} aria-hidden />
      </button>

      {/* Identité + hero prime + défi du jour */}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}
            </p>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span
                className={cx(
                  "h-2 w-2 rounded-full",
                  live ? "bg-emerald-400" : "bg-amber-300",
                )}
              />
              {live ? "Temps réel actif" : "Connexion…"}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Avatar
              name={nomComplet}
              avatarUrl={avatarUrl}
              size={64}
              className="ring-2 ring-white/10"
            />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white">
                Bonjour {firstName(nomComplet)} ! <span aria-hidden>👋</span>
              </h1>
              <p className="mt-1 text-sm text-slate-300">{todayMotivation}</p>
              {presenceStreakDays > 0 && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                  <span aria-hidden>🔥</span> {presenceStreakDays} jour
                  {presenceStreakDays > 1 ? "s" : ""} consécutif
                  {presenceStreakDays > 1 ? "s" : ""} de présence
                </p>
              )}
            </div>
          </div>

          {/* Hero : prime estimée du jour */}
          <div className="mt-6 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Prime estimée aujourd&apos;hui
            </p>
            <AnimatedMoney
              value={breakdownTotal}
              className="text-[56px] font-black leading-none text-amber-300"
            />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <IconStat
              icon={<CheckCircle2 className="h-4 w-4 text-rose-300" strokeWidth={1.8} aria-hidden />}
              value={String(ownActesToday)}
              label="Actes"
            />
            <IconStat
              icon={<Coins className="h-4 w-4 text-amber-300" strokeWidth={1.8} aria-hidden />}
              value={formatMoney(breakdownTotal)}
              label="Prime"
              accent
            />
            <IconStat
              icon={<Trophy className="h-4 w-4 text-amber-300" strokeWidth={1.8} aria-hidden />}
              value={classementLabel}
              label="Classement"
            />
          </div>
        </div>

        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Défi du jour
          </p>
          {defi.pick ? (
            <>
              <p className="mt-2 text-lg font-bold text-white">
                Encore {defi.pick.cible - defi.pick.realise} {defi.pick.label}{" "}
                aujourd&apos;hui
              </p>
              {defi.pick.bonusTotal != null && defi.pick.bonusTotal > 0 && (
                <p className="mt-1 text-sm text-amber-300">
                  +{formatMoney(defi.pick.bonusTotal)} de bonus à la clé 🎯
                </p>
              )}
              <div className="mt-3">
                <ProgressBar
                  value={pct(defi.pick.realise, defi.pick.cible)}
                  tone="violet"
                />
              </div>
              <p className="mt-1 text-right text-xs text-slate-400">
                {defi.pick.realise} / {defi.pick.cible}
              </p>
            </>
          ) : defi.allDone ? (
            <p className="mt-3 text-sm text-emerald-300">
              Tous tes objectifs du jour sont atteints, bravo ! 🎉
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-400">
              Aucun objectif du jour défini pour l&apos;instant.
            </p>
          )}
        </Card>
      </div>

      {role === "admin" && <AdminQuickAccess />}

      {/* Enregistrer un acte — 3 gros boutons */}
      <Card>
        <SectionTitle>Enregistrer un acte</SectionTitle>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {CATEGORIES.map((c) => {
            const p = progressForForm[c.acte] ?? { realise: 0, cible: 0 };
            return (
              <ActeButton
                key={c.key}
                acte={c.acte}
                label={c.label}
                realise={p.realise}
                cible={p.cible}
                onClick={() => setSheetActe(c.acte)}
              />
            );
          })}
        </div>
      </Card>

      {sheetActe && (
        <ActeEntrySheet
          open
          onClose={() => setSheetActe(null)}
          acteType={sheetActe}
          label={CATEGORIES.find((c) => c.acte === sheetActe)?.label ?? sheetActe}
          sousTypes={sousTypes}
          modeles={modeles}
          pb={pb}
          sellerVentesMois={sellerVentes}
          onSuccess={pushToast}
        />
      )}

      {/* Mes actes du jour (repliable) */}
      <Card className="p-0">
        <button
          type="button"
          onClick={() => setActesOpen((o) => !o)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
          aria-expanded={actesOpen}
        >
          <span className="text-sm font-semibold text-white">
            Mes actes du jour ({ownActesToday})
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cx(
              "h-4 w-4 text-slate-400 transition-transform",
              actesOpen && "rotate-180",
            )}
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {actesOpen && (
          <div className="border-t border-line">
            {ventesToday.length === 0 ? (
              <div className="p-5">
                <EmptyState>Aucun acte enregistré aujourd&apos;hui.</EmptyState>
              </div>
            ) : (
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Heure</th>
                      <th className="px-4 py-2.5 font-medium">Type</th>
                      <th className="px-4 py-2.5 font-medium">Qté</th>
                      <th className="px-4 py-2.5 text-right font-medium">
                        Montant
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {ventesToday.map((v) => (
                      <tr key={v.id}>
                        <td className="px-4 py-2 text-slate-400">
                          {new Date(v.created_at).toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-2 text-white">{v.acte_type}</td>
                        <td className="px-4 py-2 tabular-nums text-white">
                          {v.quantity}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-amber-300">
                          {formatMoney(ligneCommission(v, pb))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

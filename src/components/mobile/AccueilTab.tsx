"use client";

import { ChevronDown, CheckCircle2, Coins, Settings, Target, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AdminQuickAccess } from "../AdminQuickAccess";
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
import { ActeButton } from "../ActeButton";
import { ActeEntrySheet } from "../ActeEntrySheet";
import { Avatar, EmptyState, IconStat, ProgressBar, cx } from "../ui";
import { AnimatedMoney } from "../ui-client";
import { useDashboardTab } from "./DashboardTabContext";

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
  objectifs: Objectif[];
  objectifsBoutiqueMois: Partial<Record<string, number>>;
  initialSellerVentesMois: Vente[];
  initialShopVentesMois: Vente[];
  initialPrimeMensuelle: PrimeMensuelle | null;
  sellerDailyTarget: number;
  mix: Record<CatKey, number>;
  dailyTargetMcafee: number;
  dailyTargetAssurance: number;
  rang: number | null;
  totalSellers: number;
  teammates: { id: string; nom_complet: string }[];
  /** Incrémenté par le FAB de MobileDashboardShell pour ouvrir la saisie rapide. */
  fabBump?: number;
}

function ordinal(n: number): string {
  return n === 1 ? "er" : "ème";
}

export function AccueilTab(props: Props) {
  const { nomComplet, avatarUrl, role, rang, totalSellers, fabBump } = props;
  const [actesOpen, setActesOpen] = useState(true);
  const [sheetActe, setSheetActe] = useState<ActeType | null>(null);

  const {
    toasts,
    setToasts,
    pb,
    sellerVentes,
    breakdownTotal,
    ventesToday,
    ownActesToday,
    defi,
    progressForForm,
  } = useLiveDashboard(props);

  const { setBadges } = useDashboardTab();

  const dateStr = formatLongDate();
  const todayMotivation = motivation(props.today);
  const classementLabel = rang ? `${rang}${ordinal(rang)} / ${totalSellers}` : "—";

  useEffect(() => {
    setBadges({
      prime: formatMoney(breakdownTotal),
      rang: rang ? `${rang}${ordinal(rang)}` : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownTotal, rang]);

  const fabBumpRef = useRef(0);
  useEffect(() => {
    if (fabBump && fabBump !== fabBumpRef.current) {
      fabBumpRef.current = fabBump;
      setSheetActe(mostFrequentActeType(sellerVentes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabBump]);

  function pushToast(text: string) {
    setToasts((p) => [...p, { id: `${Date.now()}-${Math.random()}`, text }]);
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto max-w-xs rounded-lg border border-brand/30 bg-surface-strong/95 px-4 py-3 text-sm text-white shadow-glow backdrop-blur"
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium capitalize text-slate-400">{dateStr}</p>
        <Link href="/profil" className="flex items-center gap-2">
          <Avatar name={nomComplet} avatarUrl={avatarUrl} size={30} />
          <span className="text-sm font-medium capitalize text-white">{role}</span>
          <Settings className="h-4 w-4 text-slate-400" strokeWidth={1.8} aria-hidden />
        </Link>
      </div>

      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-white">
          Bonjour {firstName(nomComplet)} ! <span aria-hidden>👋</span>
        </h1>
        <p className="mt-0.5 text-sm text-slate-300">{todayMotivation}</p>
      </div>

      {/* Hero : prime estimée du jour — le plus gros élément de l'écran */}
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Prime estimée
        </p>
        <AnimatedMoney
          value={breakdownTotal}
          className="text-[48px] font-black leading-none text-amber-300"
        />
      </div>

      {/* 3 indicateurs clés */}
      <div className="grid grid-cols-3 gap-2">
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

      {/* Enregistrer un acte — 3 gros boutons, 2 taps pour valider une vente classique */}
      <div className="space-y-2.5">
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

      {sheetActe && (
        <ActeEntrySheet
          open
          onClose={() => setSheetActe(null)}
          acteType={sheetActe}
          label={CATEGORIES.find((c) => c.acte === sheetActe)?.label ?? sheetActe}
          sousTypes={props.sousTypes}
          modeles={props.modeles}
          pb={pb}
          sellerVentesMois={sellerVentes}
          onSuccess={pushToast}
        />
      )}

      {role === "admin" && <AdminQuickAccess />}

      {/* Défi du jour */}
      <div className="card p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
          <Target className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
          Défi du jour
        </p>
        {defi.pick ? (
          <>
            <p className="mt-2 text-base font-bold text-white">
              Encore {defi.pick.cible - defi.pick.realise} {defi.pick.label} aujourd&apos;hui
            </p>
            {defi.pick.bonusTotal != null && defi.pick.bonusTotal > 0 && (
              <p className="mt-1 text-sm text-amber-300">
                +{formatMoney(defi.pick.bonusTotal)} de bonus à la clé 🎯
              </p>
            )}
            <div className="mt-3">
              <ProgressBar value={pct(defi.pick.realise, defi.pick.cible)} tone="violet" />
            </div>
            <p className="mt-1 text-right text-xs text-slate-400">
              {defi.pick.realise} / {defi.pick.cible}
            </p>
          </>
        ) : defi.allDone ? (
          <p className="mt-2 text-sm text-emerald-300">
            Tous tes objectifs du jour sont atteints, bravo ! 🎉
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            Aucun objectif du jour défini pour l&apos;instant.
          </p>
        )}
      </div>

      {/* Mes actes du jour */}
      <div className="card p-0">
        <button
          type="button"
          onClick={() => setActesOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          aria-expanded={actesOpen}
        >
          <span className="text-sm font-semibold text-white">
            Mes actes du jour ({ownActesToday})
          </span>
          <ChevronDown
            className={cx("h-4 w-4 text-slate-400 transition-transform", actesOpen && "rotate-180")}
            strokeWidth={1.8}
            aria-hidden
          />
        </button>
        {actesOpen && (
          <div className="border-t border-line">
            {ventesToday.length === 0 ? (
              <div className="p-4">
                <EmptyState>Aucun acte enregistré aujourd&apos;hui.</EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-line/60">
                {ventesToday.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate text-white">
                      {v.acte_type} × {v.quantity}
                    </span>
                    <span className="tabular-nums text-amber-300">
                      {formatMoney(ligneCommission(v, pb))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

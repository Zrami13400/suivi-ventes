"use client";

import { ChevronDown, Settings, Smartphone, Target, Trophy, Wifi } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { firstName, formatLongDate, formatMoney, motivation, pct } from "@/lib/format";
import { ligneCommission, type CatKey } from "@/lib/kpi";
import { useLiveDashboard } from "@/lib/useLiveDashboard";
import type {
  ModeleTelephone,
  Objectif,
  PalierPrime,
  PrimeMensuelle,
  ReglePrime,
  SousTypeActe,
  Vente,
} from "@/lib/types";
import SaleForm from "../SaleForm";
import { Avatar, EmptyState, ProgressBar, cx } from "../ui";

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
}

function ordinal(n: number): string {
  return n === 1 ? "er" : "ème";
}

export function AccueilTab(props: Props) {
  const { nomComplet, avatarUrl, role, rang, totalSellers } = props;
  const [actesOpen, setActesOpen] = useState(true);

  const { toasts, pb, breakdownTotal, ventesToday, ownActesToday, defi, progressForForm } =
    useLiveDashboard(props);

  const dateStr = formatLongDate();
  const todayMotivation = motivation(props.today);
  const classementLabel = rang ? `${rang}${ordinal(rang)} / ${totalSellers}` : "—";

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
        <h1 className="text-2xl font-bold text-white">
          Bonjour {firstName(nomComplet)} ! <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-sm text-slate-300">{todayMotivation}</p>
      </div>

      {/* 3 KPI cards */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 p-3 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
            Actes du jour
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums">
            {ownActesToday}
            <span className="text-xs font-medium opacity-80">
              {" "}
              / {props.sellerDailyTarget || "—"}
            </span>
          </p>
        </div>
        <div className="rounded-xl bg-surface-strong p-3 ring-1 ring-line">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Prime estimée
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-amber-300">
            {formatMoney(breakdownTotal)}
          </p>
        </div>
        <div className="rounded-xl bg-surface-strong p-3 ring-1 ring-line">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Classement
          </p>
          <p className="mt-1.5 flex items-center gap-1 text-xl font-bold tabular-nums text-white">
            <Trophy className="h-4 w-4 text-amber-300" strokeWidth={1.8} aria-hidden />
            {classementLabel}
          </p>
        </div>
      </div>

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

      {/* Enregistrer un acte */}
      <div>
        <h2 className="text-base font-semibold text-white">Enregistrer un acte</h2>
        <p className="text-sm text-slate-400">Choisis une catégorie pour commencer.</p>
        <div className="mt-3">
          <SaleForm
            sousTypes={props.sousTypes}
            modeles={props.modeles}
            progress={progressForForm}
            initialActeType={null}
          />
        </div>
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
                    {v.acte_type === "Freebox" ? (
                      <Wifi className="h-4 w-4 shrink-0 text-violet-300" strokeWidth={1.8} aria-hidden />
                    ) : v.acte_type === "Téléphone" ? (
                      <Smartphone
                        className="h-4 w-4 shrink-0 text-emerald-300"
                        strokeWidth={1.8}
                        aria-hidden
                      />
                    ) : (
                      <Target className="h-4 w-4 shrink-0 text-sky-300" strokeWidth={1.8} aria-hidden />
                    )}
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, pct } from "@/lib/format";
import {
  actesParCategorie,
  objectifJourParCategorie,
  primeParts,
  totalActes,
  type CatKey,
} from "@/lib/kpi";
import { CATEGORIES } from "@/lib/constants";
import type { PrimeJournaliere, ReglePrime, Vente } from "@/lib/types";
import { Card, ProgressBar, cx } from "./ui";

interface Props {
  vendeurId: string;
  today: string;
  regles: ReglePrime[];
  initialVentes: Vente[];
  initialPrime: PrimeJournaliere | null;
  shop: {
    objectifBoutiqueJour: number;
    actesBoutiqueJour: number;
    caBoutiqueJour: number;
  };
  sellerDailyTarget: number;
  mix: Record<CatKey, number>;
}

export default function AccueilClient({
  vendeurId,
  today,
  regles,
  initialVentes,
  initialPrime,
  shop,
  sellerDailyTarget,
  mix,
}: Props) {
  const [ventes, setVentes] = useState<Vente[]>(initialVentes);
  const [prime, setPrime] = useState<PrimeJournaliere | null>(initialPrime);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`accueil-${vendeurId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "primes_journalieres",
          filter: `vendeur_id=eq.${vendeurId}`,
        },
        (payload) => {
          const row = payload.new as PrimeJournaliere;
          if (row && row.date === today) setPrime(row);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ventes",
          filter: `vendeur_id=eq.${vendeurId}`,
        },
        (payload) => {
          const row = payload.new as Vente;
          if (row && row.created_at.slice(0, 10) === today) {
            setVentes((prev) =>
              prev.some((v) => v.id === row.id) ? prev : [row, ...prev],
            );
          }
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [vendeurId, today]);

  const ownActes = totalActes(ventes);
  const parCat = useMemo(() => actesParCategorie(ventes), [ventes]);
  const parts = useMemo(() => primeParts(ventes, regles), [ventes, regles]);
  const primeEstimee = prime?.prime_calculee ?? parts.total;
  const objCat = objectifJourParCategorie(sellerDailyTarget, mix);

  const boutiquePct = pct(shop.actesBoutiqueJour, shop.objectifBoutiqueJour);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span
          className={cx(
            "h-2 w-2 rounded-full",
            live ? "bg-emerald-400" : "bg-amber-300",
          )}
        />
        {live ? "Mise à jour en temps réel" : "Connexion temps réel…"}
      </div>

      {/* 4 KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Objectif boutique"
          value={`${shop.actesBoutiqueJour} / ${shop.objectifBoutiqueJour || "—"}`}
          foot={<ProgressBar value={boutiquePct} tone="violet" />}
          footText={`${boutiquePct}% de l'objectif du jour`}
        />
        <Kpi
          label="CA du jour"
          value={formatMoney(shop.caBoutiqueJour)}
          badge={`${boutiquePct}%`}
          footText="Estimé depuis le barème de commission"
        />
        <Kpi
          label="Primes estimées"
          value={formatMoney(primeEstimee)}
          accent="grad-primes"
          footText="Ta commission individuelle du jour"
        />
        <Kpi
          label="Total actes du jour"
          value={String(ownActes)}
          footText="Tes actes enregistrés aujourd'hui"
        />
      </div>

      {/* Sales / Actes */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-white">
          Mes ventes du jour
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {CATEGORIES.map((c) => {
            const realise = parCat[c.key];
            const cible = objCat[c.key];
            const p = pct(realise, cible);
            return (
              <Card key={c.key} className="overflow-hidden">
                <div className={cx("-m-5 mb-4 p-4 text-white", c.grad)}>
                  <p className="text-sm font-semibold uppercase tracking-wide">
                    {c.label}
                  </p>
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {realise}
                    <span className="ml-1 text-base font-medium opacity-80">
                      / {cible || "—"}
                    </span>
                  </p>
                </div>
                <ProgressBar value={p} />
                <p className="mt-1 text-right text-xs text-slate-400">{p}%</p>
                <ul className="mt-3 space-y-1 text-xs text-slate-400">
                  {c.sousTypes.map((s) => (
                    <li key={s} className="flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-slate-500" />
                      {s}
                    </li>
                  ))}
                  {c.options.map((o) => (
                    <li key={o} className="flex items-center gap-1.5">
                      <span className={cx("h-1 w-1 rounded-full", "bg-brand-soft")} />
                      Option : {o}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Primes — privé */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            Primes du jour <span className="text-xs font-normal text-slate-500">· privé</span>
          </h2>
          <span className="text-xl font-bold text-amber-300 tabular-nums">
            {formatMoney(primeEstimee)}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <PrimeLine label="Box" value={parts.box} />
          <PrimeLine label="Forfaits" value={parts.forfaits} />
          <PrimeLine label="Téléphones" value={parts.telephones} />
          <PrimeLine label="McAfee" value={parts.mcafee} />
        </div>
        <a
          href="/profil"
          className="mt-4 inline-block text-sm font-medium text-brand-soft hover:underline"
        >
          Voir le détail →
        </a>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  badge,
  foot,
  footText,
  accent,
}: {
  label: string;
  value: string;
  badge?: string;
  foot?: React.ReactNode;
  footText?: string;
  accent?: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </p>
        {badge && (
          <span
            className={cx(
              "chip text-white",
              accent ?? "bg-brand/20 text-brand-soft",
            )}
          >
            {badge}
          </span>
        )}
      </div>
      <p
        className={cx(
          "mt-2 text-2xl font-bold tabular-nums text-white",
          accent === "grad-primes" &&
            "bg-gradient-to-r from-amber-300 to-yellow-200 bg-clip-text text-transparent",
        )}
      >
        {value}
      </p>
      {foot && <div className="mt-3">{foot}</div>}
      {footText && <p className="mt-1 text-xs text-slate-500">{footText}</p>}
    </div>
  );
}

function PrimeLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface-strong p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-white">
        {formatMoney(value)}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, pct } from "@/lib/format";
import {
  actesParCategorie,
  computeCommission,
  objectifJourParCategorie,
  priceBook,
  totalActes,
  type CatKey,
  type CommissionBreakdown as Breakdown,
} from "@/lib/kpi";
import { CATEGORIES } from "@/lib/constants";
import type {
  PalierPrime,
  PrimeMensuelle,
  ReglePrime,
  SousTypeActe,
  Vente,
} from "@/lib/types";
import { CommissionBreakdown } from "./CommissionBreakdown";
import { ProgressBar, cx } from "./ui";

interface Props {
  vendeurId: string;
  today: string;
  moisDate: string;
  regles: ReglePrime[];
  paliers: PalierPrime[];
  sousTypes: SousTypeActe[];
  objectifsBoutiqueMois: Partial<Record<string, number>>;
  initialSellerVentesMois: Vente[];
  initialShopVentesMois: Vente[];
  initialPrimeMensuelle: PrimeMensuelle | null;
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
  moisDate,
  regles,
  paliers,
  sousTypes,
  objectifsBoutiqueMois,
  initialSellerVentesMois,
  initialShopVentesMois,
  initialPrimeMensuelle,
  shop,
  sellerDailyTarget,
  mix,
}: Props) {
  const [sellerVentes, setSellerVentes] = useState<Vente[]>(
    initialSellerVentesMois,
  );
  const [shopVentes, setShopVentes] = useState<Vente[]>(initialShopVentesMois);
  const [primeMensuelle, setPrimeMensuelle] = useState<PrimeMensuelle | null>(
    initialPrimeMensuelle,
  );
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
          table: "primes_mensuelles",
          filter: `vendeur_id=eq.${vendeurId}`,
        },
        (payload) => {
          const row = payload.new as PrimeMensuelle;
          if (row && row.mois?.slice(0, 7) === moisDate.slice(0, 7)) {
            setPrimeMensuelle(row);
          }
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
          if (row && row.created_at.slice(0, 7) === moisDate.slice(0, 7)) {
            setSellerVentes((p) =>
              p.some((v) => v.id === row.id) ? p : [row, ...p],
            );
            setShopVentes((p) =>
              p.some((v) => v.id === row.id) ? p : [row, ...p],
            );
          }
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [vendeurId, moisDate]);

  const pb = useMemo(
    () => priceBook(sousTypes, regles),
    [sousTypes, regles],
  );

  const computed = useMemo(
    () =>
      computeCommission(sellerVentes, shopVentes, {
        priceBook: pb,
        regles,
        paliers,
        objectifsBoutiqueMois,
      }),
    [sellerVentes, shopVentes, pb, regles, paliers, objectifsBoutiqueMois],
  );

  // La ligne DB fait foi dès qu'elle a intégré toutes les ventes connues.
  const breakdown: Breakdown =
    primeMensuelle && primeMensuelle.total_actes >= computed.totalActes
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

  const ventesToday = sellerVentes.filter(
    (v) => v.created_at.slice(0, 10) === today,
  );
  const ownActesToday = totalActes(ventesToday);
  const parCatToday = actesParCategorie(ventesToday);
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
          footText="Estimé depuis le barème (base + bonus)"
        />
        <Kpi
          label="Primes estimées"
          value={formatMoney(breakdown.total)}
          accent
          footText="Ta commission individuelle ce mois-ci"
        />
        <Kpi
          label="Total actes du jour"
          value={String(ownActesToday)}
          footText="Tes actes enregistrés aujourd'hui"
        />
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold text-white">
          Mes ventes du jour
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {CATEGORIES.map((c) => {
            const realise = parCatToday[c.key];
            const cible = objCat[c.key];
            const p = pct(realise, cible);
            return (
              <div key={c.key} className="card overflow-hidden p-5">
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
                      <span className="h-1 w-1 rounded-full bg-brand-soft" />
                      Option : {o}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <CommissionBreakdown data={breakdown} />
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
  accent?: boolean;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </p>
        {badge && (
          <span className="chip bg-brand/20 text-brand-soft">{badge}</span>
        )}
      </div>
      <p
        className={cx(
          "mt-2 text-2xl font-bold tabular-nums text-white",
          accent &&
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

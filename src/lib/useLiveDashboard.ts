"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { firstName } from "@/lib/format";
import {
  actesParCategorie,
  bonusOptionLegacy,
  computeCommission,
  objectifJourParCategorie,
  objectifVolumeJour,
  priceBook,
  totalActes,
  type CatKey,
} from "@/lib/kpi";
import { CATEGORIES, type ActeType } from "@/lib/constants";
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

export interface LiveDashboardProps {
  vendeurId: string;
  shopId: string;
  today: string;
  moisDate: string;
  regles: ReglePrime[];
  paliers: PalierPrime[];
  sousTypes: SousTypeActe[];
  modeles: ModeleTelephone[];
  /** Options flat (null = migration 007 absente, repli sur regles_primes). */
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
  teammates: { id: string; nom_complet: string; avatar_url?: string | null }[];
}

export interface DefiCandidate {
  label: string;
  realise: number;
  cible: number;
  bonusTotal: number | null;
}

/**
 * Souscription temps réel (ventes de la boutique + prime mensuelle propre)
 * et calculs dérivés partagés entre le tableau de bord desktop
 * (`AccueilClient`) et l'onglet Accueil mobile (`AccueilTab`).
 */
export function useLiveDashboard(props: LiveDashboardProps) {
  const {
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
  } = props;

  const [sellerVentes, setSellerVentes] = useState<Vente[]>(initialSellerVentesMois);
  const [shopVentes, setShopVentes] = useState<Vente[]>(initialShopVentesMois);
  const [primeMensuelle, setPrimeMensuelle] = useState<PrimeMensuelle | null>(
    initialPrimeMensuelle,
  );
  const [live, setLive] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);

  // Identifiant stable par montage : AccueilClient (desktop, toujours monté
  // derrière `hidden lg:block`) et AccueilTab (mobile) peuvent tourner en
  // même temps pour le même vendeur. Sans suffixe, les deux instances
  // demanderaient le même topic `accueil-<vendeurId>` ; supabase-js
  // dédoublonne par topic et renverrait le channel déjà `subscribe()`d à la
  // seconde instance, qui plante alors en appelant `.on()` après coup.
  const instanceId = useId();

  const todayTotalsRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const map = new Map<string, number>();
    for (const v of initialShopVentesMois) {
      if (v.created_at.slice(0, 10) !== today) continue;
      const key = `${v.vendeur_id}|${v.acte_type}`;
      map.set(key, (map.get(key) ?? 0) + v.quantity);
    }
    todayTotalsRef.current = map;
  }, [initialShopVentesMois, today]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`accueil-${vendeurId}-${instanceId}`)
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
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          const row = payload.new as Vente;
          if (!row || row.statut === "annulée") return;
          const isToday = row.created_at.slice(0, 10) === today;
          const isMine = row.vendeur_id === vendeurId;

          if (isMine && row.created_at.slice(0, 7) === moisDate.slice(0, 7)) {
            setSellerVentes((p) => (p.some((v) => v.id === row.id) ? p : [row, ...p]));
          }
          setShopVentes((p) => (p.some((v) => v.id === row.id) ? p : [row, ...p]));

          if (isToday) {
            const key = `${row.vendeur_id}|${row.acte_type}`;
            const prevTotal = todayTotalsRef.current.get(key) ?? 0;
            const newTotal = prevTotal + row.quantity;
            todayTotalsRef.current.set(key, newTotal);

            if (!isMine) {
              const target = objectifVolumeJour(objectifs, row.acte_type, today, {
                vendeurId: row.vendeur_id,
              });
              if (target > 0 && prevTotal < target && newTotal >= target) {
                const teammate = teammates.find((t) => t.id === row.vendeur_id);
                const text = `${firstName(teammate?.nom_complet)} vient de dépasser son objectif ${row.acte_type} ! 🎉`;
                setToasts((p) => [...p, { id: `${row.id}-${Date.now()}`, text }]);
              }
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ventes",
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          // Vente annulée : elle disparaît de tous les compteurs, comme si
          // elle n'avait jamais existé. La prime stockée arrive via
          // primes_mensuelles (recalculée par trigger).
          const row = payload.new as Vente;
          if (!row || row.statut !== "annulée") return;
          setShopVentes((p) => p.filter((v) => v.id !== row.id));
          setSellerVentes((p) => p.filter((v) => v.id !== row.id));
          if (row.created_at.slice(0, 10) === today) {
            const key = `${row.vendeur_id}|${row.acte_type}`;
            const prevTotal = todayTotalsRef.current.get(key) ?? 0;
            todayTotalsRef.current.set(key, Math.max(0, prevTotal - row.quantity));
          }
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [vendeurId, shopId, moisDate, today, objectifs, teammates, instanceId]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => setToasts((p) => p.slice(1)), 7000);
    return () => clearTimeout(t);
  }, [toasts]);

  const pb = useMemo(
    () => priceBook(sousTypes, regles, modeles, options),
    [sousTypes, regles, modeles, options],
  );

  const computed = useMemo(
    () =>
      computeCommission(sellerVentes, shopVentes, {
        priceBook: pb,
        paliers,
        objectifsBoutiqueMois,
      }),
    [sellerVentes, shopVentes, pb, paliers, objectifsBoutiqueMois],
  );

  // Sans vente validée, la ligne primes_mensuelles est supprimée côté base
  // (évènement DELETE non filtrable en temps réel) : ne pas la réafficher.
  const breakdownTotal =
    primeMensuelle &&
    computed.totalActes > 0 &&
    primeMensuelle.total_actes >= computed.totalActes
      ? primeMensuelle.prime_totale
      : computed.total;

  const ventesToday = useMemo(
    () => sellerVentes.filter((v) => v.created_at.slice(0, 10) === today),
    [sellerVentes, today],
  );
  const ownActesToday = totalActes(ventesToday);
  const parCatToday = actesParCategorie(ventesToday);
  const objCat = objectifJourParCategorie(sellerDailyTarget, mix);

  const progressForForm = useMemo(() => {
    const out: Partial<Record<ActeType, { realise: number; cible: number }>> = {};
    for (const c of CATEGORIES) {
      out[c.acte] = { realise: parCatToday[c.key], cible: objCat[c.key] };
    }
    return out;
  }, [parCatToday, objCat]);

  const defi = useMemo<{ pick: DefiCandidate | null; allDone: boolean }>(() => {
    const mcafeeRealise = ventesToday.reduce(
      (s, v) => (v.acte_type === "Freebox" && v.has_mcafee ? s + v.quantity : s),
      0,
    );
    const assuranceRealise = ventesToday.reduce(
      (s, v) => (v.acte_type === "Téléphone" && v.has_assurance ? s + v.quantity : s),
      0,
    );

    const candidates: DefiCandidate[] = [];
    if (dailyTargetMcafee > 0) {
      const bonusUnit = bonusOptionLegacy(pb, "mcafee");
      const remaining = Math.max(0, dailyTargetMcafee - mcafeeRealise);
      candidates.push({
        label: "McAfee",
        realise: mcafeeRealise,
        cible: dailyTargetMcafee,
        bonusTotal: bonusUnit > 0 ? remaining * bonusUnit : null,
      });
    }
    if (dailyTargetAssurance > 0) {
      const bonusUnit = bonusOptionLegacy(pb, "assurance");
      const remaining = Math.max(0, dailyTargetAssurance - assuranceRealise);
      candidates.push({
        label: "Assurance",
        realise: assuranceRealise,
        cible: dailyTargetAssurance,
        bonusTotal: bonusUnit > 0 ? remaining * bonusUnit : null,
      });
    }
    for (const c of CATEGORIES) {
      const cible = objCat[c.key];
      if (cible > 0) {
        candidates.push({
          label: c.label,
          realise: parCatToday[c.key],
          cible,
          bonusTotal: null,
        });
      }
    }

    const open = candidates
      .filter((c) => c.realise < c.cible)
      .sort((a, b) => b.cible - b.realise - (a.cible - a.realise));

    return { pick: open[0] ?? null, allDone: candidates.length > 0 && open.length === 0 };
  }, [ventesToday, dailyTargetMcafee, dailyTargetAssurance, objCat, parCatToday, pb]);

  return {
    sellerVentes,
    shopVentes,
    primeMensuelle,
    live,
    toasts,
    setToasts,
    pb,
    computed,
    breakdownTotal,
    ventesToday,
    ownActesToday,
    parCatToday,
    objCat,
    progressForForm,
    defi,
  };
}

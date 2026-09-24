"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Rafraîchit la page serveur courante dès qu'une vente du vendeur (ou de
 * toute la boutique si `toutesVentesBoutique`) est ajoutée, modifiée ou
 * supprimée (Supabase Realtime), ou qu'un objectif de la boutique change.
 * Les rafales d'évènements sont regroupées.
 */
export function LiveRefresh({
  vendeurId,
  shopId,
  toutesVentesBoutique = false,
}: {
  vendeurId: string;
  shopId: string;
  /** Admin : écoute les ventes de toute la boutique, pas seulement les siennes. */
  toutesVentesBoutique?: boolean;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const filtreVentes = toutesVentesBoutique
      ? `shop_id=eq.${shopId}`
      : `vendeur_id=eq.${vendeurId}`;
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    const channel = supabase
      .channel(`live-refresh-${vendeurId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ventes", filter: filtreVentes },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "objectifs", filter: `shop_id=eq.${shopId}` },
        refresh,
      )
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [router, vendeurId, shopId, toutesVentesBoutique]);

  return null;
}

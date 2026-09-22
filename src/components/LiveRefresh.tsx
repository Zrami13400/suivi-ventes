"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Rafraîchit la page serveur courante dès qu'une vente du vendeur est
 * ajoutée, modifiée ou supprimée (Supabase Realtime), ou qu'un objectif de
 * la boutique change. Les rafales d'évènements sont regroupées.
 */
export function LiveRefresh({
  vendeurId,
  shopId,
}: {
  vendeurId: string;
  shopId: string;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    const channel = supabase
      .channel(`live-refresh-${vendeurId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ventes", filter: `vendeur_id=eq.${vendeurId}` },
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
  }, [router, vendeurId, shopId]);

  return null;
}

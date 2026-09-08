import { createClient } from "@/lib/supabase/server";
import { currentMonth, monthRange } from "@/lib/format";
import {
  buildRanking,
  computeBadges,
  totalActes,
  type RankRow,
} from "@/lib/kpi";
import type {
  BadgeKey,
} from "@/lib/constants";
import type {
  Objectif,
  PrimeJournaliere,
  Profile,
  ReglePrime,
  Vente,
} from "@/lib/types";

function prevMonth(mois: string): string {
  const [y, m] = mois.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m || 1) - 2, 1));
  return d.toISOString().slice(0, 7);
}

export function groupByVendeur<T extends { vendeur_id: string }>(
  rows: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const arr = map.get(r.vendeur_id) ?? [];
    arr.push(r);
    map.set(r.vendeur_id, arr);
  }
  return map;
}

export interface ShopMonth {
  mois: string;
  range: { start: string; end: string };
  sellers: Profile[];
  ventes: Vente[];
  ventesByVendeur: Map<string, Vente[]>;
  primesByVendeur: Map<string, PrimeJournaliere[]>;
  regles: ReglePrime[];
  objectifs: Objectif[];
  ranking: RankRow[];
  badges: Map<string, BadgeKey[]>;
  /** true si la table `ventes` d'autres vendeurs est lisible (RLS boutique). */
  ventesCollectivesOk: boolean;
}

/**
 * Charge et agrège toutes les données d'une boutique pour un mois donné.
 * Les primes d'autrui ne remontent que si l'appelant est admin (RLS).
 */
export async function loadShopMonth(
  shopId: string,
  mois: string = currentMonth(),
): Promise<ShopMonth> {
  const supabase = createClient();
  const range = monthRange(mois);
  const prev = monthRange(prevMonth(mois));

  const [sellersRes, ventesRes, prevVentesRes, primesRes, reglesRes, objectifsRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("shop_id", shopId)
        .order("nom_complet"),
      supabase
        .from("ventes")
        .select("*")
        .eq("shop_id", shopId)
        .gte("created_at", range.start)
        .lt("created_at", range.end)
        .order("created_at", { ascending: false }),
      supabase
        .from("ventes")
        .select("vendeur_id, quantity, created_at, acte_type")
        .eq("shop_id", shopId)
        .gte("created_at", prev.start)
        .lt("created_at", prev.end),
      supabase
        .from("primes_journalieres")
        .select("*")
        .gte("date", range.start.slice(0, 10))
        .lt("date", range.end.slice(0, 10)),
      supabase.from("regles_primes").select("*").eq("shop_id", shopId),
      supabase.from("objectifs").select("*").eq("shop_id", shopId),
    ]);

  const sellers = ((sellersRes.data ?? []) as Profile[]).filter(
    (p) => p.role === "vendeur",
  );
  const ventes = (ventesRes.data ?? []) as Vente[];
  const prevVentes = (prevVentesRes.data ?? []) as Vente[];
  const primes = (primesRes.data ?? []) as PrimeJournaliere[];
  const regles = (reglesRes.data ?? []) as ReglePrime[];
  const objectifs = (objectifsRes.data ?? []) as Objectif[];

  const ventesByVendeur = groupByVendeur(ventes);
  const primesByVendeur = groupByVendeur(primes);

  const ranking = buildRanking(
    sellers,
    ventesByVendeur,
    primesByVendeur,
    range.start,
    range.end,
  );

  const prevByVendeur = groupByVendeur(prevVentes as unknown as Vente[]);
  const actesMoisPrecedent = new Map(
    sellers.map((s) => [s.id, totalActes(prevByVendeur.get(s.id) ?? [])]),
  );
  const badges = computeBadges(ranking, actesMoisPrecedent);

  // Un vendeur qui ne voit que ses propres ventes ⇒ RLS boutique absente.
  const distinctVendeurs = new Set(ventes.map((v) => v.vendeur_id));
  const ventesCollectivesOk =
    sellers.length <= 1 || ventes.length === 0 || distinctVendeurs.size > 1;

  return {
    mois,
    range,
    sellers,
    ventes,
    ventesByVendeur,
    primesByVendeur,
    regles,
    objectifs,
    ranking,
    badges,
    ventesCollectivesOk,
  };
}

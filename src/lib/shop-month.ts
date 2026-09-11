import { createClient } from "@/lib/supabase/server";
import { currentMonth, monthRange } from "@/lib/format";
import {
  buildRanking,
  computeBadges,
  priceBook,
  totalActes,
  type PriceBook,
  type RankRow,
} from "@/lib/kpi";
import type { BadgeKey } from "@/lib/constants";
import type {
  Objectif,
  PalierPrime,
  Planning,
  PrimeJournaliere,
  PrimeMensuelle,
  Profile,
  ReglePrime,
  SousTypeActe,
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
  moisDate: string; // AAAA-MM-01
  sellers: Profile[];
  ventes: Vente[];
  ventesByVendeur: Map<string, Vente[]>;
  primesJourByVendeur: Map<string, PrimeJournaliere[]>;
  primesMensuelles: PrimeMensuelle[];
  primeMensuelleByVendeur: Map<string, PrimeMensuelle>;
  regles: ReglePrime[];
  paliers: PalierPrime[];
  sousTypes: SousTypeActe[];
  priceBook: PriceBook;
  objectifs: Objectif[];
  /** Objectif volume boutique du mois par type d'acte. */
  objectifsBoutiqueMois: Partial<Record<string, number>>;
  planning: Planning[];
  planningByVendeur: Map<string, Planning[]>;
  ranking: RankRow[];
  badges: Map<string, BadgeKey[]>;
  /** true si la table `ventes` d'autres vendeurs est lisible (RLS boutique). */
  ventesCollectivesOk: boolean;
  /** true si la migration 003 (primes_mensuelles) est en place. */
  primesMensuellesOk: boolean;
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
  const moisDate = `${mois}-01`;

  const [
    sellersRes,
    ventesRes,
    prevVentesRes,
    primesJourRes,
    primesMoisRes,
    reglesRes,
    paliersRes,
    sousTypesRes,
    objectifsRes,
    planningRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("shop_id", shopId).order("nom_complet"),
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
    supabase.from("primes_mensuelles").select("*").eq("mois", moisDate),
    supabase.from("regles_primes").select("*").eq("shop_id", shopId),
    supabase.from("paliers_primes").select("*").eq("shop_id", shopId),
    supabase.from("sous_types_actes").select("*").eq("shop_id", shopId),
    supabase.from("objectifs").select("*").eq("shop_id", shopId),
    supabase
      .from("planning")
      .select("*")
      .gte("date", range.start.slice(0, 10))
      .lt("date", range.end.slice(0, 10)),
  ]);

  const sellers = ((sellersRes.data ?? []) as Profile[]).filter(
    (p) => p.role === "vendeur",
  );
  const ventes = (ventesRes.data ?? []) as Vente[];
  const prevVentes = (prevVentesRes.data ?? []) as Vente[];
  const primesJour = (primesJourRes.data ?? []) as PrimeJournaliere[];
  const primesMensuelles = (primesMoisRes.data ?? []) as PrimeMensuelle[];
  const regles = (reglesRes.data ?? []) as ReglePrime[];
  const paliers = (paliersRes.data ?? []) as PalierPrime[];
  const sousTypes = ((sousTypesRes.data ?? []) as SousTypeActe[]).sort(
    (a, b) => a.acte_type.localeCompare(b.acte_type) || a.ordre - b.ordre,
  );
  const objectifs = (objectifsRes.data ?? []) as Objectif[];
  const planning = (planningRes.data ?? []) as Planning[];

  const ventesByVendeur = groupByVendeur(ventes);
  const primesJourByVendeur = groupByVendeur(primesJour);
  const planningByVendeur = groupByVendeur(planning);
  const primeMensuelleByVendeur = new Map(
    primesMensuelles.map((p) => [p.vendeur_id, p]),
  );
  const primeByVendeur = new Map(
    primesMensuelles.map((p) => [p.vendeur_id, Number(p.prime_totale ?? 0)]),
  );

  const objectifsBoutiqueMois: Partial<Record<string, number>> = {};
  for (const o of objectifs) {
    if (
      o.vendeur_id === null &&
      o.type_cible === "volume" &&
      o.periode === "mois" &&
      o.acte_type &&
      o.date_debut <= moisDate &&
      o.date_fin >= range.start.slice(0, 10)
    ) {
      objectifsBoutiqueMois[o.acte_type] = Number(
        o.valeur_cible ?? o.nb_ventes_cible ?? 0,
      );
    }
  }

  const ranking = buildRanking(
    sellers,
    ventesByVendeur,
    primeByVendeur,
    range.start,
    range.end,
  );

  const prevByVendeur = groupByVendeur(prevVentes as unknown as Vente[]);
  const actesMoisPrecedent = new Map(
    sellers.map((s) => [s.id, totalActes(prevByVendeur.get(s.id) ?? [])]),
  );
  const badges = computeBadges(ranking, actesMoisPrecedent);

  const distinctVendeurs = new Set(ventes.map((v) => v.vendeur_id));
  const ventesCollectivesOk =
    sellers.length <= 1 || ventes.length === 0 || distinctVendeurs.size > 1;

  return {
    mois,
    range,
    moisDate,
    sellers,
    ventes,
    ventesByVendeur,
    primesJourByVendeur,
    primesMensuelles,
    primeMensuelleByVendeur,
    regles,
    paliers,
    sousTypes,
    priceBook: priceBook(sousTypes, regles),
    objectifs,
    objectifsBoutiqueMois,
    planning,
    planningByVendeur,
    ranking,
    badges,
    ventesCollectivesOk,
    primesMensuellesOk: !primesMoisRes.error,
  };
}

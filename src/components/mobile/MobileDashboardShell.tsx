"use client";

import { useEffect } from "react";
import type { CommissionBreakdown as Breakdown, CatKey, RankRow } from "@/lib/kpi";
import type {
  ModeleTelephone,
  Objectif,
  PalierPrime,
  PrimeMensuelle,
  ReglePrime,
  Role,
  SousTypeActe,
  Vente,
} from "@/lib/types";
import { AccueilTab } from "./AccueilTab";
import { type DashboardTab, useDashboardTab } from "./DashboardTabContext";
import { EquipeTab } from "./EquipeTab";
import { PlusTab } from "./PlusTab";
import { PrimeTab } from "./PrimeTab";
import { StatsTab } from "./StatsTab";

interface AccueilProps {
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

interface Props {
  initialTab: DashboardTab;
  accueil: AccueilProps;
  stats: { sellerVentes: Vente[]; last7: { iso: string; prime: number }[] };
  equipe: {
    rows: RankRow[];
    targets: Record<string, number>;
    actesMoisPrecedent: Record<string, number>;
    selfId: string;
    canSeePrimes: boolean;
  };
  prime: { data: Breakdown; monthLabel: string };
  plus: { role: Role; nomComplet: string; avatarUrl: string | null; niveauLabel: string };
}

export function MobileDashboardShell({ initialTab, accueil, stats, equipe, prime, plus }: Props) {
  const { tab, setTab } = useDashboardTab();

  useEffect(() => {
    setTab(initialTab);
    // Ne synchronise qu'au montage / changement d'URL explicite (lien depuis
    // une autre page) : les clics sur la barre du bas ne doivent pas être
    // écrasés par ce prop initial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);

  return (
    <div className="lg:hidden">
      {tab === "accueil" && <AccueilTab {...accueil} />}
      {tab === "stats" && <StatsTab {...stats} />}
      {tab === "equipe" && <EquipeTab {...equipe} />}
      {tab === "prime" && <PrimeTab {...prime} />}
      {tab === "plus" && <PlusTab {...plus} />}
    </div>
  );
}

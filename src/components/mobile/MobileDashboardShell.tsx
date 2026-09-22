"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { CommissionBreakdown as Breakdown, CatKey, RankRow } from "@/lib/kpi";
import type {
  ModeleTelephone,
  OptionFlat,
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
  const [fabBump, setFabBump] = useState(0);

  useEffect(() => {
    setTab(initialTab);
    // Ne synchronise qu'au montage / changement d'URL explicite (lien depuis
    // une autre page) : les clics sur la barre du bas ne doivent pas être
    // écrasés par ce prop initial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);

  return (
    <div className="lg:hidden">
      {tab === "accueil" && <AccueilTab {...accueil} fabBump={fabBump} />}
      {tab === "stats" && <StatsTab {...stats} />}
      {tab === "equipe" && <EquipeTab {...equipe} />}
      {tab === "prime" && <PrimeTab {...prime} />}
      {tab === "plus" && <PlusTab {...plus} />}

      {/* FAB : partout, ramène sur Accueil et ouvre la saisie rapide —
          l'action la plus utile de l'app, à un tap. */}
      <button
        type="button"
        onClick={() => {
          setTab("accueil");
          setFabBump((n) => n + 1);
        }}
        aria-label="Ajouter une vente"
        className="fixed bottom-24 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-glow transition active:scale-95"
      >
        <Plus className="h-6 w-6" strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  );
}

"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { AccueilDashboard, type AccueilDashboardProps } from "./accueil/AccueilDashboard";

/** Accueil desktop : tableau de bord + FAB de saisie rapide (pas de barre d'onglets). */
export default function AccueilClient(props: Omit<AccueilDashboardProps, "fabBump">) {
  const [fabBump, setFabBump] = useState(0);

  return (
    <>
      <AccueilDashboard {...props} fabBump={fabBump} />
      <button
        type="button"
        onClick={() => setFabBump((n) => n + 1)}
        aria-label="Ajouter une vente"
        className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-glow transition hover:bg-brand-soft active:scale-95"
      >
        <Plus className="h-6 w-6" strokeWidth={2.2} aria-hidden />
      </button>
    </>
  );
}

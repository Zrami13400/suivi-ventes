import { CommissionBreakdown } from "../CommissionBreakdown";
import type { CommissionBreakdown as Breakdown } from "@/lib/kpi";

export function PrimeTab({ data, monthLabel }: { data: Breakdown; monthLabel: string }) {
  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-xl font-bold text-white">Détail de ma prime</h1>
        <p className="text-sm text-slate-400">{monthLabel}</p>
      </div>
      <CommissionBreakdown data={data} title="Ma prime du mois" />
      <p className="text-xs text-slate-500">
        Détail privé : base par acte, boost individuel/collectif, et bonus
        options attachées à tes ventes.
      </p>
    </div>
  );
}

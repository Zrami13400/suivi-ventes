import { formatMoney } from "@/lib/format";
import type { CommissionBreakdown as Breakdown } from "@/lib/kpi";
import { cx } from "./ui";

const LINES: {
  key: keyof Breakdown;
  label: string;
  hint: string;
}[] = [
  { key: "base", label: "Montant de base", hint: "Σ montant du sous-produit vendu" },
  {
    key: "boostIndividuel",
    label: "Boost individuel",
    hint: "€ / vente au-delà de ton seuil mensuel",
  },
  {
    key: "boostCollectif",
    label: "Boost collectif",
    hint: "part proratisée si la boutique dépasse son objectif",
  },
  { key: "bonusMcafee", label: "Bonus McAfee", hint: "attachement Freebox" },
  { key: "bonusAssurance", label: "Bonus Assurance", hint: "attachement Téléphone" },
  { key: "bonusCoque", label: "Bonus Coque", hint: "attachement Téléphone" },
  { key: "bonusReprise", label: "Bonus Reprise", hint: "attachement Téléphone" },
  { key: "bonusGarantie", label: "Bonus Garantie", hint: "attachement Téléphone" },
];

export function CommissionBreakdown({
  data,
  className,
  title = "Détail de ma prime du mois",
}: {
  data: Breakdown;
  className?: string;
  title?: string;
}) {
  return (
    <div className={cx("card p-5", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">
          {title}{" "}
          <span className="text-xs font-normal text-slate-500">· privé</span>
        </h2>
        <span className="text-xl font-bold tabular-nums text-amber-300">
          {formatMoney(data.total)}
        </span>
      </div>

      <ul className="mt-4 divide-y divide-line/60">
        {LINES.map((l) => {
          const v = Number(data[l.key] ?? 0);
          return (
            <li
              key={l.key}
              className={cx(
                "flex items-baseline justify-between gap-3 py-2.5",
                v === 0 && "opacity-45",
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{l.label}</p>
                <p className="truncate text-xs text-slate-500">{l.hint}</p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-white">
                {formatMoney(v)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

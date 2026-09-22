import { formatMoney } from "@/lib/format";
import type { CommissionBreakdown as Breakdown } from "@/lib/kpi";
import { cx } from "./ui";

const LINES: {
  key: "base" | "boostIndividuel" | "boostCollectif";
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
];

function Line({ label, hint, value }: { label: string; hint: string; value: number }) {
  return (
    <li
      className={cx(
        "flex items-baseline justify-between gap-3 py-2.5",
        value === 0 && "opacity-45",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="truncate text-xs text-slate-500">{hint}</p>
      </div>
      <span className="shrink-0 font-semibold tabular-nums text-white">
        {formatMoney(value)}
      </span>
    </li>
  );
}

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
        {LINES.map((l) => (
          <Line key={l.key} label={l.label} hint={l.hint} value={Number(data[l.key] ?? 0)} />
        ))}
        {data.optionsDetail.length > 0 ? (
          data.optionsDetail.map((o) => (
            <Line
              key={o.id}
              label={`Bonus ${o.nom}`}
              hint={
                o.qte > 0
                  ? `${o.qte} attachement${o.qte > 1 ? "s" : ""} · ${o.acte_type}`
                  : `attachement ${o.acte_type}`
              }
              value={o.montant}
            />
          ))
        ) : (
          <Line label="Bonus options" hint="aucune option attachée ce mois" value={data.bonusOptions} />
        )}
      </ul>
    </div>
  );
}

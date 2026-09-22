"use client";

import { ACTE_ACTION_STYLE, type ActeType } from "@/lib/constants";
import { ActeIcon } from "./ActeIcon";
import { cx } from "./ui";

export function ActeButton({
  acte,
  label,
  realise,
  cible,
  onClick,
}: {
  acte: ActeType;
  label: string;
  realise: number;
  cible: number;
  onClick: () => void;
}) {
  const style = ACTE_ACTION_STYLE[acte];
  const pctVal = cible > 0 ? Math.max(0, Math.min(100, Math.round((realise / cible) * 100))) : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "relative flex min-h-[100px] w-full items-center gap-4 overflow-hidden rounded-2xl px-5 py-4 text-left text-white shadow-card transition active:scale-[0.98]",
        style.grad,
      )}
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/20">
        <ActeIcon acte={acte} className="h-6 w-6 text-white" />
      </span>
      <span className="min-w-0 flex-1 text-xl font-bold leading-tight">{label}</span>
      <span className="shrink-0 text-right text-[32px] font-black leading-none tabular-nums">
        {realise}
        <span className="text-lg font-bold text-white/70"> / {cible || "—"}</span>
      </span>
      <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/20">
        <span
          className="block h-full bg-white/90 transition-all duration-500"
          style={{ width: `${pctVal}%` }}
        />
      </span>
    </button>
  );
}

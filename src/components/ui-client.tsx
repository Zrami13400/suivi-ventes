"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import { cx } from "./ui";

/**
 * Panneau modal : bottom sheet plein-largeur sur mobile (ancré en bas, coins
 * arrondis en haut), modale centrée sur desktop. Purement en CSS (pas de
 * media query JS) via `items-end sm:items-center`.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-sheet-up flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-glow sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid h-9 w-9 place-items-center rounded-full text-slate-400 transition hover:bg-surface-strong hover:text-white"
          >
            <X className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/** Ligne d'option géante à bascule (min 56px), pour les toggles McAfee / Assurance / Coque / … */
export function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        "flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition",
        checked
          ? "border-brand/40 bg-brand/10"
          : "border-line bg-surface-strong",
      )}
    >
      <span className="text-sm font-medium text-white">{label}</span>
      <span
        aria-hidden
        className={cx(
          "relative h-7 w-12 shrink-0 rounded-full transition",
          checked ? "bg-emerald-500" : "bg-white/15",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** Ligne large sélectionnable (sous-produit / modèle), min 56px. */
export function SelectRow({
  label,
  sub,
  selected,
  onClick,
}: {
  label: string;
  sub?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cx(
        "flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition",
        selected
          ? "border-brand bg-brand/15 text-white"
          : "border-line bg-surface-strong text-slate-200 hover:border-line",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{label}</span>
        {sub && <span className="block text-xs text-slate-400">{sub}</span>}
      </span>
      <span
        aria-hidden
        className={cx(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2",
          selected ? "border-brand bg-brand" : "border-line",
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
    </button>
  );
}

/** Stepper quantité : gros − / + de part et d'autre d'un grand chiffre. */
export function Stepper({
  value,
  onChange,
  min = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div className="flex items-center justify-center gap-5">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Diminuer la quantité"
        className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface-strong text-3xl font-bold text-white transition active:scale-95"
      >
        −
      </button>
      <span className="w-16 text-center text-4xl font-black tabular-nums text-white">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="Augmenter la quantité"
        className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand text-3xl font-bold text-white transition hover:bg-brand-soft active:scale-95"
      >
        +
      </button>
    </div>
  );
}

/**
 * Montant qui se met à l'échelle brièvement (scale + flash) quand il
 * augmente — feedback immédiat après l'enregistrement d'une vente.
 */
export function AnimatedMoney({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const [pulsing, setPulsing] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (value > prevRef.current) {
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), 650);
      prevRef.current = value;
      return () => clearTimeout(t);
    }
    prevRef.current = value;
  }, [value]);

  return (
    <span
      className={cx(
        "inline-block",
        pulsing && "animate-pulse-gain text-emerald-300",
        className,
      )}
    >
      {formatMoney(value)}
    </span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createVente } from "@/app/(app)/dashboard/actions";
import {
  ACTE_A_ASSURANCE,
  ACTE_A_MCAFEE,
  ACTE_TYPES,
  CATEGORIES,
  type ActeType,
} from "@/lib/constants";
import { cx } from "./ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Enregistrement…" : "Ajouter l'acte"}
    </button>
  );
}

export default function SaleForm() {
  const [state, formAction] = useFormState(createVente, {
    error: null,
    success: false,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const [acteType, setActeType] = useState<ActeType>(ACTE_TYPES[0]);
  const cat = CATEGORIES.find((c) => c.acte === acteType);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setActeType(ACTE_TYPES[0]);
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {CATEGORIES.map((c) => (
          <button
            type="button"
            key={c.key}
            onClick={() => setActeType(c.acte)}
            className={cx(
              "rounded-lg border p-3 text-left text-sm font-medium transition",
              acteType === c.acte
                ? cx("text-white", c.grad, "border-transparent")
                : "border-line bg-surface-strong text-slate-300 hover:text-white",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <input type="hidden" name="acte_type" value={acteType} />

      <div className="grid gap-4 sm:grid-cols-2">
        {cat && cat.sousTypes.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Sous-type <span className="text-slate-500">(indicatif)</span>
            </label>
            <select name="sous_type" className="field mt-1">
              {cat.sousTypes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Quantité
          </label>
          <input
            name="quantity"
            type="number"
            step="1"
            min="1"
            defaultValue={1}
            required
            className="field mt-1"
          />
        </div>
      </div>

      {acteType === ACTE_A_MCAFEE && (
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            name="has_mcafee"
            type="checkbox"
            className="h-4 w-4 rounded border-line bg-surface-strong text-brand focus:ring-brand"
          />
          Option McAfee
        </label>
      )}

      {acteType === ACTE_A_ASSURANCE && (
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            name="has_assurance"
            type="checkbox"
            className="h-4 w-4 rounded border-line bg-surface-strong text-brand focus:ring-brand"
          />
          Option Assurance mobile
        </label>
      )}

      {state.error && (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Acte enregistré. La prime se met à jour automatiquement.
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

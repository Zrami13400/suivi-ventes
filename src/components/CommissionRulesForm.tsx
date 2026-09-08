"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateReglesPrimes } from "@/app/(app)/admin/actions";
import {
  ACTE_A_ASSURANCE,
  ACTE_A_MCAFEE,
  ACTE_FIELD_KEY,
  ACTE_TYPES,
  type ActeType,
} from "@/lib/constants";
import type { ReglePrime } from "@/lib/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Enregistrement…" : "Enregistrer le barème"}
    </button>
  );
}

const cellInputCls = "field w-28";

export default function CommissionRulesForm({
  regles,
}: {
  regles: ReglePrime[];
}) {
  const [state, formAction] = useFormState(updateReglesPrimes, {
    error: null,
    success: false,
  });

  const byActe = new Map(regles.map((r) => [r.acte_type, r]));
  const valueFor = (acte: ActeType, field: keyof ReglePrime): number =>
    Number(byActe.get(acte)?.[field] ?? 0);

  return (
    <form action={formAction} className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-4 font-medium">Type d&apos;acte</th>
              <th className="py-2 pr-4 font-medium">Montant / acte (€)</th>
              <th className="py-2 pr-4 font-medium">Bonus McAfee (€)</th>
              <th className="py-2 pr-4 font-medium">Bonus Assurance (€)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {ACTE_TYPES.map((acte) => {
              const key = ACTE_FIELD_KEY[acte];
              return (
                <tr key={acte}>
                  <td className="py-2 pr-4 font-medium text-gray-900">{acte}</td>
                  <td className="py-2 pr-4">
                    <input
                      name={`${key}__montant_par_acte`}
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={valueFor(acte, "montant_par_acte")}
                      className={cellInputCls}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    {acte === ACTE_A_MCAFEE ? (
                      <input
                        name={`${key}__bonus_mcafee`}
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={valueFor(acte, "bonus_mcafee")}
                        className={cellInputCls}
                      />
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {acte === ACTE_A_ASSURANCE ? (
                      <input
                        name={`${key}__bonus_assurance`}
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={valueFor(acte, "bonus_assurance")}
                        className={cellInputCls}
                      />
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Commission d&apos;un vendeur = (quantité × montant par acte) + (nombre de
        McAfee × bonus McAfee) + (nombre d&apos;Assurance × bonus Assurance).
      </p>

      {state.error && (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Barème enregistré. Les primes du jour ont été recalculées.
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

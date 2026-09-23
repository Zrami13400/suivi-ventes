"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { createObjectif } from "@/app/(app)/admin/actions";
import {
  ACTE_A_TAUX,
  OBJECTIF_ACTE_FIELD_KEY,
  OBJECTIF_ACTE_TYPES,
} from "@/lib/constants";

interface VendeurOption {
  id: string;
  nom_complet: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Enregistrement…" : "Enregistrer les objectifs"}
    </button>
  );
}

export default function ObjectifForm({
  vendeurs,
}: {
  vendeurs: VendeurOption[];
}) {
  const [state, formAction] = useActionState(createObjectif, {
    error: null,
    success: false,
  });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-sm font-medium text-slate-300">Cible</label>
          <select name="cible" defaultValue="boutique" className="field mt-1">
            <option value="boutique">Boutique (global)</option>
            {vendeurs.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nom_complet}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Période
          </label>
          <select name="periode" defaultValue="mois" className="field mt-1">
            <option value="jour">Jour</option>
            <option value="semaine">Semaine</option>
            <option value="mois">Mois</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Date de début
          </label>
          <input name="date_debut" type="date" required className="field mt-1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Date de fin
          </label>
          <input name="date_fin" type="date" required className="field mt-1" />
        </div>
      </div>

      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-4 font-medium">Type d&apos;acte</th>
              <th className="py-2 pr-4 font-medium">Volumétrie (actes)</th>
              <th className="py-2 pr-4 font-medium">Taux d&apos;attachement (%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {OBJECTIF_ACTE_TYPES.map((acte) => {
              const key = OBJECTIF_ACTE_FIELD_KEY[acte];
              const taux = ACTE_A_TAUX[acte];
              return (
                <tr key={acte}>
                  <td className="py-2 pr-4 font-medium text-white">
                    {acte}
                    {taux && (
                      <span className="ml-1 text-xs text-slate-500">
                        / {taux}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      name={`${key}__volume`}
                      type="number"
                      step="1"
                      min="0"
                      placeholder="—"
                      className="field w-28"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    {taux ? (
                      <input
                        name={`${key}__taux`}
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        placeholder="—"
                        className="field w-28"
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
        Laissez vide pour ne pas définir de cible. Un enregistrement remplace
        l&apos;objectif de même portée / période / dates / type.
      </p>

      {state.error && (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Objectifs enregistrés.
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

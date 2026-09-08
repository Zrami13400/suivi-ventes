"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createObjectif } from "@/app/(app)/admin/actions";

interface VendeurOption {
  id: string;
  nom_complet: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Création…" : "Créer l'objectif"}
    </button>
  );
}

const inputCls = "field mt-1";

export default function ObjectifForm({
  vendeurs,
}: {
  vendeurs: VendeurOption[];
}) {
  const [state, formAction] = useFormState(createObjectif, {
    error: null,
    success: false,
  });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Période
          </label>
          <select name="periode" defaultValue="jour" className={inputCls}>
            <option value="jour">Jour</option>
            <option value="semaine">Semaine</option>
            <option value="mois">Mois</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300">
            Vendeur
          </label>
          <select name="vendeur_id" defaultValue="" className={inputCls}>
            <option value="">Toute la boutique</option>
            {vendeurs.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nom_complet}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300">
            Date de début
          </label>
          <input name="date_debut" type="date" required className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300">
            Date de fin
          </label>
          <input name="date_fin" type="date" required className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300">
            Nombre d&apos;actes cible
          </label>
          <input
            name="nb_ventes_cible"
            type="number"
            step="1"
            min="0"
            required
            className={inputCls}
          />
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Objectif créé.
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createChallenge } from "@/app/(app)/admin/actions";

interface VendeurOption {
  id: string;
  nom_complet: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Création…" : "Créer le challenge"}
    </button>
  );
}

export default function ChallengeForm({
  vendeurs,
}: {
  vendeurs: VendeurOption[];
}) {
  const [state, formAction] = useFormState(createChallenge, {
    error: null,
    success: false,
  });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300">Titre</label>
        <input
          name="titre"
          required
          placeholder="Box 2 vs 1, Manon vs Jonathan…"
          className="field mt-1"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300">
          Description <span className="text-slate-500">(facultatif)</span>
        </label>
        <input name="description" className="field mt-1" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Métrique
          </label>
          <select name="metrique" defaultValue="actes" className="field mt-1">
            <option value="actes">Tous les actes</option>
            <option value="Freebox">Freebox</option>
            <option value="Forfait mobile">Forfait mobile</option>
            <option value="Téléphone">Téléphone</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Prime bonus au gagnant (€)
          </label>
          <input
            name="prime_bonus"
            type="number"
            step="0.01"
            min="0"
            defaultValue={0}
            className="field mt-1"
          />
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

      <div>
        <label className="block text-sm font-medium text-slate-300">
          Participants (2 minimum)
        </label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {vendeurs.map((v) => (
            <label
              key={v.id}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface-strong px-3 py-2 text-sm text-slate-300"
            >
              <input
                type="checkbox"
                name="participants"
                value={v.id}
                className="h-4 w-4 rounded border-line bg-surface text-brand focus:ring-brand"
              />
              {v.nom_complet}
            </label>
          ))}
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Challenge créé.
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

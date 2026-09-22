"use client";

import { useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  addSousType,
  deleteSousType,
  updateBaremePrimes,
} from "@/app/(app)/admin/actions";
import { CATEGORIES } from "@/lib/constants";
import type { PalierPrime, ReglePrime, SousTypeActe } from "@/lib/types";

const ACTE_KEY: Record<string, string> = {
  Freebox: "freebox",
  "Forfait mobile": "forfait_mobile",
  Téléphone: "telephone",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Enregistrement…" : "Enregistrer le barème"}
    </button>
  );
}

export default function BaremeForm({
  sousTypes,
  paliers,
  regles,
}: {
  sousTypes: SousTypeActe[];
  paliers: PalierPrime[];
  regles: ReglePrime[];
}) {
  const [state, formAction] = useFormState(updateBaremePrimes, {
    error: null,
    success: false,
  });
  const [, startTransition] = useTransition();

  const paliersByActe = new Map(paliers.map((p) => [p.acte_type, p]));
  const reglePhone = regles.find((r) => r.acte_type === "Téléphone");
  const mcafee = regles.find((r) => r.acte_type === "Freebox")?.bonus_mcafee ?? 0;
  const assurance = reglePhone?.bonus_assurance ?? 0;
  const coque = reglePhone?.bonus_coque ?? 0;
  const reprise = reglePhone?.bonus_reprise ?? 0;
  const garantie = reglePhone?.bonus_garantie ?? 0;

  function handleDelete(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(() => {
      deleteSousType(fd);
    });
  }

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6">
        {CATEGORIES.map((c) => {
          const items = sousTypes.filter((s) => s.acte_type === c.acte);
          const pal = paliersByActe.get(c.acte);
          const key = ACTE_KEY[c.acte];
          return (
            <div key={c.key} className="card-soft p-4">
              <div className={`-m-4 mb-4 rounded-t-2xl p-3 text-sm font-semibold uppercase tracking-wide text-white ${c.grad}`}>
                {c.label}
              </div>

              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-4 font-medium">Sous-produit</th>
                    <th className="py-1.5 pr-4 font-medium">Montant de base (€)</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-2 text-slate-500">
                        Aucun sous-produit — ajoutez-en un ci-dessous.
                      </td>
                    </tr>
                  )}
                  {items.map((s) => (
                    <tr key={s.id}>
                      <td className="py-1.5 pr-4 text-white">{s.nom}</td>
                      <td className="py-1.5 pr-4">
                        <input
                          name={`st__${s.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={s.montant_base}
                          className="field w-28"
                        />
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(s.id)}
                          className="text-xs font-medium text-rose-400 hover:text-rose-300"
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
                    Seuil individuel / mois
                  </label>
                  <input
                    name={`pal__${key}__seuil`}
                    type="number"
                    step="1"
                    min="0"
                    defaultValue={pal?.seuil_individuel ?? 0}
                    className="field mt-1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
                    Boost individuel (€ / vente au-delà)
                  </label>
                  <input
                    name={`pal__${key}__boost_ind`}
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={pal?.boost_individuel ?? 0}
                    className="field mt-1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
                    Boost collectif (€ / vente, si objectif boutique dépassé)
                  </label>
                  <input
                    name={`pal__${key}__boost_col`}
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={pal?.boost_collectif ?? 0}
                    className="field mt-1"
                  />
                </div>
              </div>
            </div>
          );
        })}

        <div className="card-soft p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-white">
            Bonus options (flat)
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
                Bonus McAfee (€ / attachement, Freebox)
              </label>
              <input
                name="bonus_mcafee"
                type="number"
                step="0.01"
                min="0"
                defaultValue={mcafee}
                className="field mt-1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
                Bonus Assurance (€ / attachement, Téléphone)
              </label>
              <input
                name="bonus_assurance"
                type="number"
                step="0.01"
                min="0"
                defaultValue={assurance}
                className="field mt-1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
                Bonus Coque (€ / attachement, Téléphone)
              </label>
              <input
                name="bonus_coque"
                type="number"
                step="0.01"
                min="0"
                defaultValue={coque}
                className="field mt-1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
                Bonus Reprise (€ / attachement, Téléphone)
              </label>
              <input
                name="bonus_reprise"
                type="number"
                step="0.01"
                min="0"
                defaultValue={reprise}
                className="field mt-1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
                Bonus Garantie (€ / attachement, Téléphone)
              </label>
              <input
                name="bonus_garantie"
                type="number"
                step="0.01"
                min="0"
                defaultValue={garantie}
                className="field mt-1"
              />
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Prime du mois d&apos;un vendeur = Σ(montant de base) + boost individuel
          (au-delà du seuil, par type d&apos;acte) + boost collectif (si la
          boutique dépasse son objectif mensuel) + bonus McAfee/Assurance.
        </p>

        {state.error && (
          <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            Barème enregistré. Les primes du mois ont été recalculées.
          </p>
        )}

        <SubmitButton />
      </form>

      <AddSousTypeForm />
    </div>
  );
}

function AddSousTypeForm() {
  return (
    <form action={addSousType} className="card-soft space-y-3 p-4">
      <p className="text-sm font-semibold text-white">
        Ajouter un sous-produit
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <select name="acte_type" className="field" defaultValue="Freebox">
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.acte}>
              {c.label}
            </option>
          ))}
        </select>
        <input name="nom" placeholder="Nom (ex. Ultra)" required className="field sm:col-span-2" />
        <input
          name="montant_base"
          type="number"
          step="0.01"
          min="0"
          placeholder="Montant €"
          className="field"
        />
      </div>
      <button type="submit" className="btn-ghost">
        Ajouter
      </button>
    </form>
  );
}

"use client";

import { useState } from "react";
import {
  createModele,
  deleteModele,
  updateModele,
} from "@/app/(app)/admin/actions";
import type { ModeleTelephone } from "@/lib/types";
import { DeleteModeleButton } from "./DeleteModeleButton";
import { cx } from "./ui";

function ModeleRow({ modele }: { modele: ModeleTelephone }) {
  const [editing, setEditing] = useState(false);
  // Figé au montage : Date.now() ne peut pas être appelé pendant le rendu.
  const [now] = useState(() => Date.now());

  if (!editing) {
    const expired =
      modele.mois_validite != null &&
      now - new Date(modele.updated_at).getTime() >
        modele.mois_validite * 30 * 24 * 60 * 60 * 1000;
    return (
      <tr>
        <td className="py-2 pr-4 text-white">{modele.marque}</td>
        <td className="py-2 pr-4 text-white">{modele.nom}</td>
        <td className="py-2 pr-4 tabular-nums text-slate-300">
          {modele.montant_base.toFixed(2)} €
        </td>
        <td className="py-2 pr-4 text-slate-400">
          {modele.mois_validite ? `${modele.mois_validite} mois` : "Illimitée"}
        </td>
        <td className="py-2 pr-4">
          <span
            className={cx(
              "chip",
              modele.actif && !expired
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-surface-strong text-slate-500",
            )}
          >
            {modele.actif ? (expired ? "Expiré" : "Actif") : "Inactif"}
          </span>
        </td>
        <td className="py-2 text-right">
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-medium text-brand-soft hover:text-white"
            >
              Modifier
            </button>
            <form action={deleteModele}>
              <input type="hidden" name="id" value={modele.id} />
              <DeleteModeleButton />
            </form>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={6} className="py-2">
        <form
          action={updateModele}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-strong p-3"
        >
          <input type="hidden" name="id" value={modele.id} />
          <div>
            <label className="block text-xs text-slate-400">Marque</label>
            <input name="marque" defaultValue={modele.marque} required className="field mt-1 w-32" />
          </div>
          <div>
            <label className="block text-xs text-slate-400">Modèle</label>
            <input name="nom" defaultValue={modele.nom} required className="field mt-1 w-40" />
          </div>
          <div>
            <label className="block text-xs text-slate-400">Montant base (€)</label>
            <input
              name="montant_base"
              type="number"
              step="0.01"
              min="0"
              defaultValue={modele.montant_base}
              className="field mt-1 w-28"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400">Validité (mois)</label>
            <input
              name="mois_validite"
              type="number"
              step="1"
              min="1"
              placeholder="illimitée"
              defaultValue={modele.mois_validite ?? ""}
              className="field mt-1 w-28"
            />
          </div>
          <label className="flex items-center gap-1.5 pb-2 text-sm text-slate-300">
            <input
              name="actif"
              type="checkbox"
              defaultChecked={modele.actif}
              className="h-4 w-4 rounded border-line bg-surface-strong text-brand focus:ring-brand"
            />
            Actif
          </label>
          <div className="ml-auto flex gap-2 pb-0.5">
            <button type="submit" className="btn-primary">
              Enregistrer
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost">
              Annuler
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

export default function ModeleForm({ modeles }: { modeles: ModeleTelephone[] }) {
  const byMarque = new Map<string, ModeleTelephone[]>();
  for (const m of modeles) {
    const arr = byMarque.get(m.marque) ?? [];
    arr.push(m);
    byMarque.set(m.marque, arr);
  }

  return (
    <div className="space-y-6">
      <div className="card scrollbar-thin overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Marque</th>
              <th className="px-4 py-3 font-medium">Modèle</th>
              <th className="px-4 py-3 font-medium">Montant base</th>
              <th className="px-4 py-3 font-medium">Validité</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60 px-4">
            {modeles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-slate-500">
                  Aucun modèle — ajoutez-en un ci-dessous.
                </td>
              </tr>
            ) : (
              Array.from(byMarque.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .flatMap(([, rows]) =>
                  rows.map((m) => (
                    <ModeleRow key={`${m.id}-${m.updated_at}`} modele={m} />
                  )),
                )
            )}
          </tbody>
        </table>
      </div>

      <form action={createModele} className="card-soft space-y-3 p-4">
        <p className="text-sm font-semibold text-white">Ajouter un modèle</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <input name="marque" placeholder="Marque (ex. iPhone)" required className="field" />
          <input
            name="nom"
            placeholder="Modèle (ex. 16 Pro)"
            required
            className="field sm:col-span-2"
          />
          <input
            name="montant_base"
            type="number"
            step="0.01"
            min="0"
            placeholder="Montant €"
            className="field"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <input
            name="mois_validite"
            type="number"
            step="1"
            min="1"
            placeholder="Validité (mois, optionnel)"
            className="field"
          />
        </div>
        <button type="submit" className="btn-ghost">
          Ajouter
        </button>
      </form>

      <p className="text-xs text-slate-500">
        Un modèle expiré (validité dépassée) reste rattaché aux ventes déjà
        enregistrées, mais n&apos;est plus proposé dans le formulaire de
        vente. Laissez la validité vide pour un modèle permanent.
      </p>
    </div>
  );
}

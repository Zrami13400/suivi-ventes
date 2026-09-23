"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  addSousType,
  deleteSousType,
  updateBaremePrimes,
} from "@/app/(app)/admin/actions";
import { CATEGORIES } from "@/lib/constants";
import type { OptionFlat, PalierPrime, SousTypeActe } from "@/lib/types";
import { cx } from "./ui";

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
  options,
  usage,
}: {
  sousTypes: SousTypeActe[];
  paliers: PalierPrime[];
  /** null = table options_flat absente (migration 007 non exécutée). */
  options: OptionFlat[] | null;
  /** Nombre de ventes (toutes périodes) où chaque option est cochée. */
  usage: Record<string, number>;
}) {
  const [state, formAction] = useActionState(updateBaremePrimes, {
    error: null,
    success: false,
  });
  const [, startTransition] = useTransition();

  const paliersByActe = new Map(paliers.map((p) => [p.acte_type, p]));

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

        <OptionsEditor options={options} usage={usage} />

        <p className="text-xs text-slate-500">
          Prime du mois d&apos;un vendeur = Σ(montant de base) + boost individuel
          (au-delà du seuil, par type d&apos;acte) + boost collectif (si la
          boutique dépasse son objectif mensuel) + bonus des options attachées.
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

// ------------------------------------------------------------------
// Options flat : liste éditable (nom, montant, actif, ordre) groupée par
// type d'acte. Les modifications partent avec "Enregistrer le barème" via
// le champ caché options_json (cf. updateBaremePrimes).
// ------------------------------------------------------------------
interface OptionRow {
  /** Clé React stable (id en base, ou clé temporaire pour une nouvelle ligne). */
  key: string;
  id: string | null;
  nom: string;
  acte_type: string;
  montant: string;
  actif: boolean;
}

function toRows(options: OptionFlat[]): OptionRow[] {
  return options.map((o) => ({
    key: o.id,
    id: o.id,
    nom: o.nom,
    acte_type: o.acte_type,
    montant: String(o.montant_bonus ?? 0),
    actif: o.actif,
  }));
}

function OptionsEditor({
  options,
  usage,
}: {
  options: OptionFlat[] | null;
  usage: Record<string, number>;
}) {
  const [rows, setRows] = useState<OptionRow[]>(() => toRows(options ?? []));
  const tmpSeq = useRef(0);

  // Resynchronise après enregistrement : la page serveur est revalidée et
  // renvoie les ids des options nouvellement créées. Ajusté pendant le rendu
  // (et non dans un effet) pour éviter un rendu intermédiaire périmé.
  const [prevOptions, setPrevOptions] = useState(options);
  if (options !== prevOptions) {
    setPrevOptions(options);
    setRows(toRows(options ?? []));
  }

  const payload = useMemo(() => {
    const ordreParActe = new Map<string, number>();
    return JSON.stringify(
      rows.map((r) => {
        const ordre = ordreParActe.get(r.acte_type) ?? 0;
        ordreParActe.set(r.acte_type, ordre + 1);
        return {
          id: r.id,
          nom: r.nom,
          acte_type: r.acte_type,
          montant_bonus: r.montant,
          actif: r.actif,
          ordre,
        };
      }),
    );
  }, [rows]);

  if (options === null) {
    return (
      <div className="card-soft p-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-white">
          Bonus options (flat)
        </p>
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Table <code>options_flat</code> introuvable — exécutez
          migrations/007_options_flat.sql pour rendre les options éditables.
        </p>
      </div>
    );
  }

  function patch(key: string, p: Partial<OptionRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }

  function move(key: string, dir: -1 | 1) {
    setRows((prev) => {
      const row = prev.find((r) => r.key === key);
      if (!row) return prev;
      const group = prev.filter((r) => r.acte_type === row.acte_type);
      const i = group.indexOf(row);
      const j = i + dir;
      if (j < 0 || j >= group.length) return prev;
      [group[i], group[j]] = [group[j], group[i]];
      return [...prev.filter((r) => r.acte_type !== row.acte_type), ...group];
    });
  }

  function add(acte_type: string) {
    tmpSeq.current += 1;
    const key = `new-${tmpSeq.current}`;
    setRows((prev) => [
      ...prev,
      { key, id: null, nom: "", acte_type, montant: "0", actif: true },
    ]);
  }

  function remove(row: OptionRow) {
    const nb = row.id ? usage[row.id] ?? 0 : 0;
    if (
      nb > 0 &&
      !window.confirm(
        `« ${row.nom} » est cochée sur ${nb} vente${nb > 1 ? "s" : ""}. ` +
          "La supprimer retirera son bonus de ces ventes, y compris des " +
          "commissions passées, au prochain recalcul.\n\n" +
          "Pour simplement ne plus la proposer aux vendeurs, désactivez-la " +
          "plutôt.\n\nSupprimer quand même ?",
      )
    ) {
      return;
    }
    setRows((prev) => prev.filter((r) => r.key !== row.key));
  }

  return (
    <div className="card-soft p-4">
      <input type="hidden" name="options_json" value={payload} />
      <p className="text-sm font-semibold uppercase tracking-wide text-white">
        Bonus options (flat)
      </p>
      <p className="mt-1 text-xs text-slate-500">
        € par attachement. Une option désactivée n&apos;est plus proposée à la
        saisie mais garde son bonus sur les ventes passées. Les changements
        sont appliqués à l&apos;enregistrement du barème.
      </p>

      <div className="mt-4 space-y-5">
        {CATEGORIES.map((c) => {
          const group = rows.filter((r) => r.acte_type === c.acte);
          return (
            <div key={c.key}>
              <p className={cx("text-xs font-semibold uppercase tracking-wide", c.accent)}>
                {c.label}
              </p>
              <ul className="mt-2 space-y-2">
                {group.length === 0 && (
                  <li className="text-sm text-slate-500">Aucune option.</li>
                )}
                {group.map((r, i) => {
                  const nb = r.id ? usage[r.id] ?? 0 : 0;
                  return (
                    <li
                      key={r.key}
                      className={cx(
                        "flex flex-wrap items-center gap-2 rounded-xl border border-line/60 p-2",
                        !r.actif && "opacity-60",
                      )}
                    >
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => move(r.key, -1)}
                          disabled={i === 0}
                          aria-label={`Monter ${r.nom}`}
                          className="text-slate-400 hover:text-white disabled:opacity-30"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(r.key, 1)}
                          disabled={i === group.length - 1}
                          aria-label={`Descendre ${r.nom}`}
                          className="text-slate-400 hover:text-white disabled:opacity-30"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                      <input
                        value={r.nom}
                        onChange={(e) => patch(r.key, { nom: e.target.value })}
                        placeholder="Nom de l'option"
                        aria-label="Nom de l'option"
                        required
                        className="field min-w-0 flex-1 basis-40"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          value={r.montant}
                          onChange={(e) => patch(r.key, { montant: e.target.value })}
                          type="number"
                          step="0.01"
                          min="0"
                          aria-label={`Bonus € pour ${r.nom || "l'option"}`}
                          className="field w-24"
                        />
                        <span className="text-sm text-slate-400">€</span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={r.actif}
                        onClick={() => patch(r.key, { actif: !r.actif })}
                        className="flex items-center gap-2 text-xs text-slate-300"
                      >
                        <span
                          className={cx(
                            "relative inline-flex h-5 w-9 shrink-0 rounded-full transition",
                            r.actif ? "bg-emerald-500" : "bg-slate-600",
                          )}
                        >
                          <span
                            className={cx(
                              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                              r.actif ? "left-[18px]" : "left-0.5",
                            )}
                          />
                        </span>
                        {r.actif ? "Active" : "Inactive"}
                      </button>
                      {nb > 0 && (
                        <span className="text-xs text-slate-500">
                          {nb} vente{nb > 1 ? "s" : ""}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(r)}
                        aria-label={`Supprimer ${r.nom}`}
                        className="ml-auto text-rose-400 hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => add(c.acte)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter une option
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

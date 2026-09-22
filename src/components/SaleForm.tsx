"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createVente } from "@/app/(app)/dashboard/actions";
import {
  ACTE_TYPES,
  CATEGORIES,
  type ActeType,
} from "@/lib/constants";
import type { ModeleTelephone, OptionFlat, SousTypeActe } from "@/lib/types";
import { cx } from "./ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Enregistrement…" : "Ajouter l'acte"}
    </button>
  );
}

// Icônes SVG minimales (pas de dépendance externe), un path par type d'acte.
function ActeIcon({ acte, className }: { acte: ActeType; className?: string }) {
  const paths: Record<ActeType, string> = {
    Freebox: "M3 7l9-4 9 4-9 4-9-4Zm0 0v10l9 4V11M21 7v10l-9 4",
    "Forfait mobile": "M4 20h.01M9 20v-6M14 20V9M19 20V4",
    Téléphone:
      "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 16h.01",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("h-5 w-5", className)}
      aria-hidden
    >
      <path d={paths[acte]} />
    </svg>
  );
}

function isModeleUtilisable(m: ModeleTelephone): boolean {
  if (!m.actif) return false;
  if (m.mois_validite == null) return true;
  const expiry =
    new Date(m.updated_at).getTime() + m.mois_validite * 30 * 24 * 60 * 60 * 1000;
  return Date.now() < expiry;
}

export default function SaleForm({
  sousTypes = [],
  modeles = [],
  options: flatOptions = [],
  progress,
  initialActeType = ACTE_TYPES[0],
}: {
  sousTypes?: SousTypeActe[];
  /** Modèles de téléphones configurés par l'admin (migration 006). */
  modeles?: ModeleTelephone[];
  /** Options flat de la boutique (catalogue admin, migration 007). */
  options?: OptionFlat[];
  /** Progression du jour par type d'acte (réalisé / cible), pour les cartes. */
  progress?: Partial<Record<ActeType, { realise: number; cible: number }>>;
  /**
   * Type présélectionné à l'affichage et après un envoi réussi. `null` pour
   * ne rien présélectionner : le formulaire (sous-produit / quantité /
   * options / bouton) ne s'affiche alors qu'après le clic sur une carte.
   */
  initialActeType?: ActeType | null;
}) {
  const [state, formAction] = useFormState(createVente, {
    error: null,
    success: false,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const [acteType, setActeType] = useState<ActeType | null>(initialActeType);
  const isTelephone = acteType === "Téléphone";

  const options = useMemo(
    () => (acteType ? sousTypes.filter((s) => s.acte_type === acteType) : []),
    [sousTypes, acteType],
  );
  const acteOptions = useMemo(
    () => flatOptions.filter((o) => o.actif && o.acte_type === acteType),
    [flatOptions, acteType],
  );

  const modelesUtilisables = useMemo(
    () => modeles.filter(isModeleUtilisable),
    [modeles],
  );
  const modelesByMarque = useMemo(() => {
    const map = new Map<string, ModeleTelephone[]>();
    for (const m of modelesUtilisables) {
      const arr = map.get(m.marque) ?? [];
      arr.push(m);
      map.set(m.marque, arr);
    }
    return map;
  }, [modelesUtilisables]);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setActeType(initialActeType);
    }
  }, [state.success, initialActeType]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {CATEGORIES.map((c) => {
          const p = progress?.[c.acte];
          const pctVal =
            p && p.cible > 0
              ? Math.max(0, Math.min(100, Math.round((p.realise / p.cible) * 100)))
              : 0;
          const active = acteType === c.acte;
          return (
            <button
              type="button"
              key={c.key}
              onClick={() => setActeType(c.acte)}
              aria-pressed={active}
              className={cx(
                "flex flex-col gap-2 rounded-lg border p-3 text-left transition",
                active
                  ? cx("border-transparent text-white shadow-card", c.grad)
                  : "border-line bg-surface-strong text-slate-300 hover:text-white",
              )}
            >
              <div className="flex items-center gap-2">
                <ActeIcon
                  acte={c.acte}
                  className={active ? "text-white" : c.accent}
                />
                <span className="text-sm font-semibold">{c.label}</span>
              </div>
              {p && (
                <>
                  <div
                    className={cx(
                      "h-1.5 w-full overflow-hidden rounded-full",
                      active ? "bg-white/25" : "bg-white/10",
                    )}
                  >
                    <div
                      className={cx(
                        "h-full rounded-full transition-all",
                        active ? "bg-white" : "bg-brand",
                      )}
                      style={{ width: `${pctVal}%` }}
                    />
                  </div>
                  <p
                    className={cx(
                      "text-xs",
                      active ? "text-white/80" : "text-slate-500",
                    )}
                  >
                    {p.realise} / {p.cible || "—"} réalisés
                  </p>
                </>
              )}
            </button>
          );
        })}
      </div>
      {acteType ? (
        <>
          <input type="hidden" name="acte_type" value={acteType} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-300">
                {isTelephone ? "Modèle" : "Sous-produit"}
              </label>
              {isTelephone ? (
                modelesUtilisables.length > 0 ? (
                  <select name="modele_id" className="field mt-1" defaultValue="">
                    <option value="">— non précisé —</option>
                    {Array.from(modelesByMarque.entries())
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([marque, items]) => (
                        <optgroup key={marque} label={marque}>
                          {items.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nom}
                              {m.montant_base > 0 ? ` (${m.montant_base} €)` : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                  </select>
                ) : (
                  <p className="field mt-1 text-slate-500">
                    Aucun modèle configuré (admin → Modèles)
                  </p>
                )
              ) : options.length > 0 ? (
                <select name="sous_type_id" className="field mt-1" defaultValue="">
                  <option value="">— non précisé —</option>
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                      {s.montant_base > 0 ? ` (${s.montant_base} €)` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="field mt-1 text-slate-500">
                  Aucun sous-produit configuré
                </p>
              )}
            </div>
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

          {acteOptions.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {acteOptions.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    name="option_ids"
                    value={o.id}
                    type="checkbox"
                    className="h-4 w-4 rounded border-line bg-surface-strong text-brand focus:ring-brand"
                  />
                  {o.nom}
                </label>
              ))}
            </div>
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
        </>
      ) : (
        <p className="text-sm text-slate-500">
          Choisis un type d&apos;acte ci-dessus pour continuer.
        </p>
      )}
    </form>
  );
}

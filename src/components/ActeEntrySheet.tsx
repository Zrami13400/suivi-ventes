"use client";

import { useMemo, useState } from "react";
import { createVente } from "@/app/(app)/dashboard/actions";
import type { ActeType } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import {
  isModeleUtilisable,
  ligneCommission,
  mostFrequentSubProduct,
  optionsActives,
  type PriceBook,
} from "@/lib/kpi";
import type { ModeleTelephone, SousTypeActe, Vente } from "@/lib/types";
import { BottomSheet, SelectRow, Stepper, SwitchRow } from "./ui-client";

interface Props {
  open: boolean;
  onClose: () => void;
  acteType: ActeType;
  label: string;
  sousTypes: SousTypeActe[];
  modeles: ModeleTelephone[];
  pb: PriceBook;
  sellerVentesMois: Vente[];
  /** Appelé après un enregistrement réussi, avec un message prêt pour le toast. */
  onSuccess: (message: string) => void;
}

export function ActeEntrySheet({
  open,
  onClose,
  acteType,
  label,
  sousTypes,
  modeles,
  pb,
  sellerVentesMois,
  onSuccess,
}: Props) {
  const isTelephone = acteType === "Téléphone";
  const isFreebox = acteType === "Freebox";

  const options = useMemo(
    () => sousTypes.filter((s) => s.acte_type === acteType),
    [sousTypes, acteType],
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

  const [sousTypeId, setSousTypeId] = useState<string | null>(null);
  const [modeleId, setModeleId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [numeroClient, setNumeroClient] = useState("");
  // Ids des options flat cochées (catalogue admin, cf. options_flat).
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Réinitialise et présélectionne le sous-produit le plus vendu à chaque
  // ouverture, pour qu'une vente classique se confirme en deux taps.
  // Ajusté pendant le rendu (et non dans un effet) : la feuille s'ouvre
  // directement avec les bonnes valeurs, sans rendu intermédiaire.
  const openKey = open ? acteType : null;
  const [prevOpenKey, setPrevOpenKey] = useState<ActeType | null>(null);
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (openKey) {
      const freq = mostFrequentSubProduct(sellerVentesMois, acteType);
      setQuantity(1);
      setNumeroClient("");
      setOptionIds([]);
      setError(null);
      if (isTelephone) {
        setModeleId(freq.modeleId ?? modelesUtilisables[0]?.id ?? null);
        setSousTypeId(null);
      } else {
        setSousTypeId(freq.sousTypeId ?? options[0]?.id ?? null);
        setModeleId(null);
      }
    }
  }

  const flatOptions = useMemo(() => optionsActives(pb, acteType), [pb, acteType]);

  function toggleOption(id: string, on: boolean) {
    setOptionIds((p) => (on ? [...p.filter((x) => x !== id), id] : p.filter((x) => x !== id)));
  }

  const selectedSousType = options.find((o) => o.id === sousTypeId);
  const selectedModele = modelesUtilisables.find((m) => m.id === modeleId);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("acte_type", acteType);
      fd.set("quantity", String(quantity));
      if (sousTypeId) fd.set("sous_type_id", sousTypeId);
      if (modeleId) fd.set("modele_id", modeleId);
      if (isFreebox && numeroClient.trim()) fd.set("numero_client", numeroClient.trim());
      for (const id of optionIds) fd.append("option_ids", id);

      const result = await createVente({ error: null, success: false }, fd);

      if (!result.success) {
        setError(result.error ?? "Une erreur est survenue.");
        return;
      }

      const delta = ligneCommission(
        {
          id: "",
          vendeur_id: "",
          shop_id: "",
          acte_type: acteType,
          quantity,
          has_mcafee: false,
          has_assurance: false,
          has_coque: false,
          has_reprise: false,
          has_garantie: false,
          options: optionIds,
          sous_type_id: sousTypeId,
          modele_id: modeleId,
          created_at: new Date().toISOString(),
        },
        pb,
      );
      const produitLabel = selectedModele?.nom ?? selectedSousType?.nom ?? label;
      onSuccess(`✓ ${produitLabel} ajouté · +${formatMoney(delta)}`);
      onClose();
    } catch {
      setError("Connexion impossible. Réessaie.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={label}>
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {isTelephone ? "Modèle" : "Sous-produit"}
          </p>
          {isTelephone ? (
            modelesUtilisables.length > 0 ? (
              <div className="space-y-4" role="radiogroup" aria-label="Modèle">
                {Array.from(modelesByMarque.entries())
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([marque, items]) => (
                    <div key={marque}>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {marque}
                      </p>
                      <div className="space-y-2">
                        {items.map((m) => (
                          <SelectRow
                            key={m.id}
                            label={m.nom}
                            sub={m.montant_base > 0 ? `${m.montant_base} €` : undefined}
                            selected={modeleId === m.id}
                            onClick={() => setModeleId(m.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="rounded-xl border border-line bg-surface-strong px-4 py-3 text-sm text-slate-400">
                Aucun modèle configuré (admin → Modèles).
              </p>
            )
          ) : options.length > 0 ? (
            <div className="space-y-2" role="radiogroup" aria-label="Sous-produit">
              {options.map((s) => (
                <SelectRow
                  key={s.id}
                  label={s.nom}
                  sub={s.montant_base > 0 ? `${s.montant_base} €` : undefined}
                  selected={sousTypeId === s.id}
                  onClick={() => setSousTypeId(s.id)}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-line bg-surface-strong px-4 py-3 text-sm text-slate-400">
              Aucun sous-produit configuré.
            </p>
          )}
        </div>

        {isFreebox && (
          <div>
            <label
              htmlFor="numero-client"
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400"
            >
              ID client <span className="font-normal normal-case text-slate-500">(optionnel)</span>
            </label>
            <input
              id="numero-client"
              type="text"
              inputMode="text"
              autoComplete="off"
              maxLength={64}
              value={numeroClient}
              onChange={(e) => setNumeroClient(e.target.value)}
              placeholder="Ex. 12345678"
              className="field min-h-[48px] text-base"
            />
            <p className="mt-1.5 text-xs text-slate-500">Optionnel — pour suivre le dossier</p>
          </div>
        )}

        {/* Pas de volumétrie sur Freebox : la quantité reste à 1. */}
        {!isFreebox && (
          <div>
            <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
              Quantité
            </p>
            <Stepper value={quantity} onChange={setQuantity} />
          </div>
        )}

        {flatOptions.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Options
            </p>
            <div className="space-y-2">
              {flatOptions.map((o) => (
                <SwitchRow
                  key={o.id}
                  label={o.nom}
                  checked={optionIds.includes(o.id)}
                  onChange={(on) => toggleOption(o.id, on)}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="min-h-[64px] w-full rounded-2xl bg-brand text-lg font-bold text-white shadow-glow transition hover:bg-brand-soft disabled:opacity-60"
        >
          {submitting ? "Enregistrement…" : "Valider"}
        </button>
      </div>
    </BottomSheet>
  );
}

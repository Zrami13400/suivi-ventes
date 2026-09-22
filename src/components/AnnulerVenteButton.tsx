"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { annulerVente } from "@/app/(app)/ventes/actions";
import { BottomSheet } from "./ui-client";
import { cx } from "./ui";

const MOTIFS = ["Erreur de saisie", "Client a annulé", "Doublon"];

/** Bouton « Annuler » + confirmation avec motif facultatif. */
export function AnnulerVenteButton({
  venteId,
  resume,
  className,
}: {
  venteId: string;
  /** Rappel de la vente dans la confirmation, ex. « Freebox Pop × 1 ». */
  resume: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setMotif("");
    setError(null);
  };

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const res = await annulerVente(venteId, motif);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setMotif("");
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          "rounded-md border border-rose-500/30 px-2 py-1 text-xs font-medium text-rose-300 transition hover:bg-rose-500/10",
          className,
        )}
      >
        Annuler
      </button>
      <BottomSheet open={open} onClose={close} title="Annuler cette vente ?">
        <p className="text-sm text-slate-300">
          <span className="font-semibold text-white">{resume}</span> ne sera plus
          comptée dans les actes, la commission ni les objectifs. La vente reste
          visible dans l&apos;historique comme annulée.
        </p>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
          Motif (facultatif)
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MOTIFS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMotif(m)}
              className={cx(
                "rounded-full border px-3 py-1.5 text-sm transition",
                motif === m
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-surface-strong text-slate-400 hover:text-white",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          maxLength={200}
          placeholder="Ou précise le motif…"
          className="field mt-2 w-full"
        />
        {error && (
          <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={close} className="btn-ghost" disabled={pending}>
            Garder
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:opacity-60"
          >
            {pending ? "Annulation…" : "Annuler la vente"}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}

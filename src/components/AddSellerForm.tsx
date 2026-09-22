"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./ui";

export default function AddSellerForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function resetPreview(next: string | null) {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next;
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    resetPreview(file ? URL.createObjectURL(file) : null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/admin/create-seller", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error ?? "Une erreur est survenue.");
        return;
      }
      setSuccess(true);
      formRef.current?.reset();
      resetPreview(null);
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Nom complet
          </label>
          <input
            name="nom_complet"
            type="text"
            required
            className="field mt-1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Email
          </label>
          <input name="email" type="email" required className="field mt-1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Mot de passe (temporaire)
          </label>
          <input
            name="password"
            type="text"
            required
            minLength={8}
            className="field mt-1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Photo (avatar)
          </label>
          <div className="mt-1 flex items-center gap-3">
            <Avatar name={"?"} avatarUrl={preview} size={40} />
            <input
              name="avatar"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onFileChange}
              className="field py-1.5 text-xs text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Vendeur créé avec succès.
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Création…" : "Créer le vendeur"}
      </button>
    </form>
  );
}

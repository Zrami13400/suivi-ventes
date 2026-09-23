"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./ui";

function Feedback({ error, success }: { error: string | null; success: string | null }) {
  if (error) {
    return (
      <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
        {success}
      </p>
    );
  }
  return null;
}

/** Nom et photo de l'utilisateur connecté (email et rôle : admin uniquement). */
export function EditOwnProfileForm({
  nomComplet,
  avatarUrl,
}: {
  nomComplet: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError(json.error ?? "Une erreur est survenue.");
        return;
      }
      setSuccess(json.message ?? "Profil mis à jour.");
      if (fileRef.current) fileRef.current.value = "";
      setPreview(null);
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar name={nomComplet} avatarUrl={preview ?? avatarUrl} size={56} />
        <div className="min-w-0 flex-1">
          <label className="block text-sm font-medium text-slate-300">Photo</label>
          <input
            ref={fileRef}
            name="avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onFileChange}
            className="field mt-1 py-1.5 text-xs text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300">
          Nom complet
        </label>
        <input
          name="nom_complet"
          type="text"
          required
          defaultValue={nomComplet}
          className="field mt-1"
        />
      </div>
      <Feedback error={error} success={success} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}

/**
 * Changement de mot de passe côté client : le mot de passe actuel est
 * vérifié en se ré-authentifiant, puis supabase.auth.updateUser applique
 * le nouveau.
 */
export function ChangePasswordForm({ email }: { email: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const current = String(data.get("current_password") ?? "");
    const next = String(data.get("new_password") ?? "");
    const confirmation = String(data.get("confirm_password") ?? "");

    setError(null);
    setSuccess(null);
    if (next.length < 8) {
      setError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (next !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (next === current) {
      setError("Le nouveau mot de passe doit être différent de l'actuel.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (signInErr) {
        setError("Mot de passe actuel incorrect.");
        return;
      }
      const { error: updateErr } = await supabase.auth.updateUser({
        password: next,
      });
      if (updateErr) {
        setError("Changement impossible : " + updateErr.message);
        return;
      }
      setSuccess("Mot de passe modifié.");
      formRef.current?.reset();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300">
          Mot de passe actuel
        </label>
        <input
          name="current_password"
          type="password"
          required
          autoComplete="current-password"
          className="field mt-1"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Nouveau mot de passe
          </label>
          <input
            name="new_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="field mt-1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Confirmation
          </label>
          <input
            name="confirm_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="field mt-1"
          />
        </div>
      </div>
      <Feedback error={error} success={success} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Modification…" : "Changer mon mot de passe"}
      </button>
    </form>
  );
}

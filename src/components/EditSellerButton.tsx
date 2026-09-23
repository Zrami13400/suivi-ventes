"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, X } from "lucide-react";
import { Avatar } from "./ui";

type Seller = {
  id: string;
  nom_complet: string;
  email: string;
  avatar_url: string | null;
};

export function EditSellerButton({ seller }: { seller: Seller }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-brand-soft hover:text-white"
      >
        Modifier
      </button>
      {open && <EditSellerDialog seller={seller} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditSellerDialog({
  seller,
  onClose,
}: {
  seller: Seller;
  onClose: () => void;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  async function post(body: FormData) {
    const res = await fetch("/api/admin/update-seller", { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(json.error ?? "Une erreur est survenue.");
    }
    return json as { message?: string; password?: string };
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const body = new FormData(e.currentTarget);
      body.set("id", seller.id);
      const json = await post(body);
      setSuccess(json.message ?? "Vendeur mis à jour.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de contacter le serveur.");
    } finally {
      setPending(false);
    }
  }

  async function onGeneratePassword() {
    if (
      !confirm(
        `Générer un nouveau mot de passe pour ${seller.nom_complet} ? L'ancien ne fonctionnera plus.`,
      )
    ) {
      return;
    }
    setResetting(true);
    setError(null);
    setSuccess(null);
    setCopied(false);
    try {
      const body = new FormData();
      body.set("id", seller.id);
      body.set("mode", "reset_password");
      const json = await post(body);
      setTempPassword(json.password ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de contacter le serveur.");
    } finally {
      setResetting(false);
    }
  }

  async function copyPassword() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Modifier ${seller.nom_complet}`}
        className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Modifier le vendeur</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-surface-strong hover:text-white"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar
              name={seller.nom_complet}
              avatarUrl={preview ?? seller.avatar_url}
              size={56}
            />
            <div className="min-w-0 flex-1">
              <label className="block text-sm font-medium text-slate-300">
                Photo
              </label>
              <input
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
              defaultValue={seller.nom_complet}
              className="field mt-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Email
            </label>
            <input
              name="email"
              type="email"
              required
              defaultValue={seller.email}
              className="field mt-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Nouveau mot de passe
            </label>
            <input
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              className="field mt-1"
            />
            <p className="mt-1 text-xs text-slate-500">
              Laisser vide pour ne pas changer
            </p>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {success}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">
              Fermer
            </button>
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>

        <div className="mt-5 border-t border-line/60 pt-4">
          <p className="text-sm font-medium text-slate-300">
            Réinitialiser le mot de passe
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Génère un mot de passe aléatoire à transmettre au vendeur.
          </p>
          {tempPassword ? (
            <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
              <p className="text-xs text-amber-200">
                Mot de passe temporaire — il ne sera plus affiché après
                fermeture :
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 select-all rounded-md bg-surface-strong px-3 py-2 font-mono text-sm text-white">
                  {tempPassword}
                </code>
                <button type="button" onClick={copyPassword} className="btn-ghost">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copié" : "Copier"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onGeneratePassword}
              disabled={resetting}
              className="btn-ghost mt-3 disabled:opacity-60"
            >
              <KeyRound size={14} />
              {resetting ? "Génération…" : "Générer un mot de passe temporaire"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

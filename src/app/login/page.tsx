"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? "Connexion…" : "Se connecter"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useActionState(login, { error: null });

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl grad-freebox text-xl font-black text-white">
            F
          </span>
          <div>
            <h1 className="text-2xl font-bold text-white">FreeKpi</h1>
            <p className="text-sm text-slate-400">
              Ventes, objectifs &amp; primes de la boutique
            </p>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-base font-semibold text-white">Connexion</h2>
          <p className="mt-1 text-sm text-slate-400">
            Accédez à votre tableau de bord.
          </p>

          <form action={formAction} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="field mt-1"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-300"
              >
                Mot de passe
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="field mt-1"
              />
            </div>

            {state.error && (
              <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {state.error}
              </p>
            )}

            <SubmitButton />
          </form>
        </div>
      </div>
    </main>
  );
}

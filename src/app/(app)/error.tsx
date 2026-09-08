"use client";

import { signOut } from "@/app/login/actions";

export default function AppError({ error }: { error: Error }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-white">
          Impossible d&apos;afficher cette page
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          {error.message ||
            "Une erreur est survenue lors du chargement de vos données."}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Vérifiez qu&apos;une ligne <code>profiles</code> existe pour votre
          compte et que les politiques RLS autorisent sa lecture.
        </p>
        <form action={signOut} className="mt-6">
          <button type="submit" className="btn-ghost">
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}

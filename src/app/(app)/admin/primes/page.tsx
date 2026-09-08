import CommissionRulesForm from "@/components/CommissionRulesForm";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ReglePrime } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPrimesPage() {
  const admin = await requireAdmin();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("regles_primes")
    .select("*")
    .eq("shop_id", admin.shop_id);

  const regles = (data ?? []) as ReglePrime[];

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-white">
          Barème de commission
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Définissez le montant de prime par acte pour chaque type d&apos;acte,
          ainsi que les bonus McAfee (Freebox) et Assurance (Téléphone). La prime
          de chaque vendeur est recalculée automatiquement (trigger SQL sur{" "}
          <code>ventes</code>).
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error.message}
          </p>
        )}

        <div className="mt-4">
          <CommissionRulesForm regles={regles} />
        </div>
      </div>
    </div>
  );
}

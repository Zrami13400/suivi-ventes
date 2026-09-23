import AddSellerForm from "@/components/AddSellerForm";
import { DeleteSellerButton } from "@/components/DeleteSellerButton";
import { EditSellerButton } from "@/components/EditSellerButton";
import { Avatar, Card, EmptyState, SectionTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getUserEmails } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { deleteSeller } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminVendeursPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("shop_id", admin.shop_id)
    .eq("role", "vendeur")
    .order("nom_complet");
  const sellers = (data ?? []) as Profile[];
  const emails = await getUserEmails(sellers.map((s) => s.id));

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle>Ajouter un vendeur</SectionTitle>
        <div className="mt-4">
          <AddSellerForm />
        </div>
      </Card>

      <div>
        <SectionTitle>Vendeurs de la boutique ({sellers.length})</SectionTitle>
        {sellers.length === 0 ? (
          <EmptyState>Aucun vendeur pour le moment.</EmptyState>
        ) : (
          <div className="card divide-y divide-line/60 p-0">
            {sellers.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={s.nom_complet} avatarUrl={s.avatar_url} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">
                    {s.nom_complet}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {emails.get(s.id) || "—"}
                  </p>
                </div>
                <EditSellerButton
                  seller={{
                    id: s.id,
                    nom_complet: s.nom_complet,
                    email: emails.get(s.id) ?? "",
                    avatar_url: s.avatar_url,
                  }}
                />
                <form action={deleteSeller}>
                  <input type="hidden" name="id" value={s.id} />
                  <DeleteSellerButton />
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

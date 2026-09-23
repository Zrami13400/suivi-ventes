import Link from "next/link";
import { headers } from "next/headers";
import { Sidebar } from "@/components/Sidebar";
import { TopBanner } from "@/components/TopBanner";
import { HideOnDashboard } from "@/components/HideOnDashboard";
import { BottomNav } from "@/components/mobile/BottomNav";
import { DashboardTabProvider } from "@/components/mobile/DashboardTabContext";
import { signOut } from "@/app/login/actions";
import { getCurrentProfileOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfileOrNull();

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card w-full max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold text-white">
            Aucun profil associé à ce compte
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Votre compte est authentifié mais aucune ligne <code>profiles</code>{" "}
            ne lui correspond. Contactez un administrateur pour vous rattacher à
            une boutique et un rôle.
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

  const supabase = createClient();
  const { data: shop } = await supabase
    .from("shops")
    .select("nom")
    .eq("id", profile.shop_id)
    .single();

  // /dashboard construit son propre bloc identité + motivation ; le bandeau
  // générique ne s'affiche que sur les autres pages.
  const pathname = headers().get("x-pathname") ?? "";
  const isDashboard = pathname === "/dashboard";

  return (
    <DashboardTabProvider>
      <div className="flex min-h-screen">
        <Sidebar
          role={profile.role}
          nomComplet={profile.nom_complet}
          avatarUrl={profile.avatar_url}
          shopNom={shop?.nom ?? ""}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Barre mobile (masquée sur l'accueil, qui a son propre en-tête) */}
          {!isDashboard && (
            <header className="flex items-center justify-between border-b border-line bg-surface/70 px-4 py-3 backdrop-blur lg:hidden">
              <Link href="/dashboard" className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg grad-freebox font-black text-white">
                  F
                </span>
                <span className="font-bold text-white">FreeKpi</span>
              </Link>
              <form action={signOut}>
                <button type="submit" className="btn-ghost">
                  Déconnexion
                </button>
              </form>
            </header>
          )}

          <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 pb-24 lg:px-8 lg:pb-8">
            <HideOnDashboard>
              <TopBanner
                nomComplet={profile.nom_complet}
                avatarUrl={profile.avatar_url}
              />
            </HideOnDashboard>
            {children}
          </main>
        </div>

        <BottomNav />
      </div>
    </DashboardTabProvider>
  );
}

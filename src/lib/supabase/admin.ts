import { createClient } from "@supabase/supabase-js";

// Service-role client for privileged, server-only operations (creating auth
// users, uploading avatars, looking up user emails). SUPABASE_SERVICE_ROLE_KEY
// has no NEXT_PUBLIC_ prefix so Next.js never inlines it into client bundles —
// only import this module from route handlers, server actions or server
// components, never from a "use client" file.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (ou NEXT_PUBLIC_SUPABASE_URL) manquant côté serveur.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Résout les emails (auth.users) d'un ensemble de profils, via l'API admin
 * GoTrue (la table auth.users n'est pas exposée par PostgREST). Boucle sur
 * quelques pages seulement : suffisant pour la taille d'une boutique FreeKpi.
 */
export async function getUserEmails(
  ids: string[],
): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  const remaining = new Set(ids);
  if (remaining.size === 0) return emails;

  const supabaseAdmin = createAdminClient();
  for (let page = 1; page <= 5 && remaining.size > 0; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (remaining.has(u.id)) {
        emails.set(u.id, u.email ?? "");
        remaining.delete(u.id);
      }
    }
    if (data.users.length < 1000) break;
  }
  return emails;
}

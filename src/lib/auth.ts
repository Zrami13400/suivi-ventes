import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * Loads the authenticated user and their profile row. Redirects to /login when
 * there is no session, and throws when the profile row is missing.
 */
export async function getCurrentProfileOrNull(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (profile as Profile | null) ?? null;
}

export async function getCurrentProfile(): Promise<Profile> {
  const profile = await getCurrentProfileOrNull();

  if (!profile) {
    throw new Error(
      "Aucun profil associé à ce compte. Contactez un administrateur.",
    );
  }

  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (profile.role !== "admin") {
    redirect("/dashboard");
  }
  return profile;
}

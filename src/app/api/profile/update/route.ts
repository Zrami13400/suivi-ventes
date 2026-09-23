import { NextResponse } from "next/server";
import { readAvatarFile, uploadAvatar } from "@/lib/avatar-upload";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function fail(error: string, status = 400) {
  return NextResponse.json({ error, success: false }, { status });
}

// Permet à l'utilisateur connecté de modifier SON nom et SA photo. L'id vient
// de la session, jamais du formulaire ; email et rôle ne sont pas modifiables
// ici (réservés à l'admin via /api/admin/update-seller). Le mot de passe se
// change côté client avec supabase.auth.updateUser.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Session expirée, reconnectez-vous.", 401);

  const supabaseAdmin = createAdminClient();
  const { data: me } = await supabaseAdmin
    .from("profiles")
    .select("id, shop_id, nom_complet, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (!me) return fail("Profil introuvable.", 404);

  const formData = await request.formData();
  const nom_complet = String(formData.get("nom_complet") ?? "").trim();
  if (!nom_complet) {
    return fail("Le nom complet est requis.");
  }
  const avatarFile = readAvatarFile(formData.get("avatar"));
  if (avatarFile && "error" in avatarFile) {
    return fail(avatarFile.error);
  }

  let avatar_url: string | null = me.avatar_url;
  if (avatarFile) {
    const uploaded = await uploadAvatar(
      supabaseAdmin,
      me.shop_id,
      me.id,
      avatarFile,
    );
    if ("error" in uploaded) return fail(uploaded.error, 500);
    avatar_url = uploaded.url;
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ nom_complet, avatar_url })
    .eq("id", me.id);
  if (error) {
    return fail("Mise à jour du profil impossible : " + error.message, 500);
  }

  return NextResponse.json({
    success: true,
    message: "Profil mis à jour.",
    profile: { nom_complet, avatar_url },
  });
}

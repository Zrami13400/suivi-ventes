import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { readAvatarFile, uploadAvatar } from "@/lib/avatar-upload";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function fail(error: string, status = 400) {
  return NextResponse.json({ error, success: false }, { status });
}

// Crée un compte auth Supabase + un profil vendeur pour la boutique de
// l'admin appelant, avec un avatar optionnel. Utilise la clé service_role
// (côté serveur uniquement) pour l'API admin GoTrue et l'upload Storage.
export async function POST(request: Request) {
  const admin = await requireAdmin();

  const formData = await request.formData();
  const nom_complet = String(formData.get("nom_complet") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const avatarEntry = formData.get("avatar");

  if (!nom_complet) {
    return fail("Le nom complet est requis.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Adresse e-mail invalide.");
  }
  if (password.length < 8) {
    return fail("Le mot de passe doit contenir au moins 8 caractères.");
  }

  const avatarFile = readAvatarFile(avatarEntry);
  if (avatarFile && "error" in avatarFile) {
    return fail(avatarFile.error);
  }

  const supabaseAdmin = createAdminClient();

  const { data: created, error: createErr } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nom_complet },
    });
  if (createErr || !created?.user) {
    return fail(createErr?.message ?? "Création du compte impossible.");
  }
  const userId = created.user.id;

  let avatar_url: string | null = null;
  if (avatarFile) {
    const uploaded = await uploadAvatar(
      supabaseAdmin,
      admin.shop_id,
      userId,
      avatarFile,
    );
    if ("error" in uploaded) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return fail(uploaded.error);
    }
    avatar_url = uploaded.url;
  }

  const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
    id: userId,
    shop_id: admin.shop_id,
    nom_complet,
    role: "vendeur",
    avatar_url,
  });
  if (profileErr) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return fail("Échec de la création du profil : " + profileErr.message);
  }

  return NextResponse.json({
    success: true,
    seller: { id: userId, nom_complet, email, avatar_url, role: "vendeur" },
  });
}

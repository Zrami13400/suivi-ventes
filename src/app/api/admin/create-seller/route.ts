import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

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

  let avatarFile: File | null = null;
  if (avatarEntry instanceof File && avatarEntry.size > 0) {
    if (!ALLOWED_AVATAR_TYPES.includes(avatarEntry.type)) {
      return fail("Format d'image non supporté (PNG, JPEG, WebP ou GIF).");
    }
    if (avatarEntry.size > MAX_AVATAR_BYTES) {
      return fail("L'image dépasse la taille maximale de 5 Mo.");
    }
    avatarFile = avatarEntry;
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
    const ext = avatarFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${admin.shop_id}/${userId}.${ext}`;
    const buffer = Buffer.from(await avatarFile.arrayBuffer());
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("avatars")
      .upload(path, buffer, { contentType: avatarFile.type, upsert: true });
    if (uploadErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return fail("Échec de l'envoi de l'avatar : " + uploadErr.message);
    }
    avatar_url = supabaseAdmin.storage.from("avatars").getPublicUrl(path).data
      .publicUrl;
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

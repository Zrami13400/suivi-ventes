import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { readAvatarFile, uploadAvatar } from "@/lib/avatar-upload";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function fail(error: string, status = 400) {
  return NextResponse.json({ error, success: false }, { status });
}

// Sans caractères ambigus (0/O, 1/l/I) : le mot de passe est recopié à la main.
const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generatePassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}

// Modifie un vendeur existant (nom, photo, email, mot de passe) pour le
// compte d'un admin de la même boutique. Le rôle de l'appelant est relu en
// base côté serveur ; rien de ce qu'envoie le client n'est cru sur parole.
//
// Deux modes :
//  - mode=reset_password : génère un mot de passe temporaire, l'applique
//    et le renvoie une seule fois dans la réponse ;
//  - sinon : édition complète (nom_complet, email, avatar, password
//    optionnels — un champ vide ou inchangé n'est pas modifié).
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Session expirée, reconnectez-vous.", 401);

  const supabaseAdmin = createAdminClient();
  const { data: caller } = await supabaseAdmin
    .from("profiles")
    .select("id, shop_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!caller || caller.role !== "admin") {
    return fail("Action réservée aux administrateurs.", 403);
  }

  const formData = await request.formData();
  const id = String(formData.get("id") ?? "");
  const mode = String(formData.get("mode") ?? "edit");

  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("id, shop_id, role, nom_complet, avatar_url")
    .eq("id", id)
    .maybeSingle();
  if (!target || target.shop_id !== caller.shop_id || target.role !== "vendeur") {
    return fail("Vendeur introuvable dans votre boutique.", 404);
  }

  if (mode === "reset_password") {
    const password = generatePassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password,
    });
    if (error) {
      return fail("Réinitialisation impossible : " + error.message, 500);
    }
    return NextResponse.json({
      success: true,
      message: "Mot de passe temporaire généré.",
      password,
    });
  }

  const nom_complet = String(formData.get("nom_complet") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!nom_complet) {
    return fail("Le nom complet est requis.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Adresse e-mail invalide.");
  }
  if (password && password.length < 8) {
    return fail("Le mot de passe doit contenir au moins 8 caractères.");
  }
  const avatarFile = readAvatarFile(formData.get("avatar"));
  if (avatarFile && "error" in avatarFile) {
    return fail(avatarFile.error);
  }

  const { data: authData, error: getErr } =
    await supabaseAdmin.auth.admin.getUserById(id);
  if (getErr || !authData?.user) {
    return fail("Compte d'authentification introuvable.", 404);
  }
  const emailChanged = (authData.user.email ?? "").toLowerCase() !== email;

  // Compte auth d'abord : c'est là que les erreurs sont les plus probables
  // (email déjà utilisé, mot de passe refusé par la politique du projet).
  if (emailChanged || password) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      ...(emailChanged ? { email, email_confirm: true } : {}),
      ...(password ? { password } : {}),
    });
    if (error) {
      return fail("Mise à jour du compte impossible : " + error.message);
    }
  }

  let avatar_url: string | null = target.avatar_url;
  if (avatarFile) {
    const uploaded = await uploadAvatar(
      supabaseAdmin,
      target.shop_id,
      id,
      avatarFile,
    );
    if ("error" in uploaded) return fail(uploaded.error, 500);
    avatar_url = uploaded.url;
  }

  if (nom_complet !== target.nom_complet || avatar_url !== target.avatar_url) {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ nom_complet, avatar_url })
      .eq("id", id);
    if (error) {
      return fail("Mise à jour du profil impossible : " + error.message, 500);
    }
  }

  const changes = [
    nom_complet !== target.nom_complet && "nom",
    emailChanged && "email",
    avatarFile && "photo",
    password && "mot de passe",
  ].filter(Boolean);

  return NextResponse.json({
    success: true,
    message:
      changes.length > 0
        ? `Vendeur mis à jour (${changes.join(", ")}).`
        : "Aucune modification à enregistrer.",
    seller: { id, nom_complet, email, avatar_url },
  });
}

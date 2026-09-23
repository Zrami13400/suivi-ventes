import type { SupabaseClient } from "@supabase/supabase-js";

// Helpers serveur pour les avatars (bucket Storage "avatars"). À n'utiliser
// qu'avec le client service_role, depuis des route handlers.

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * Extrait et valide le fichier avatar d'un FormData. Renvoie `null` quand
 * aucun fichier n'a été choisi, ou `{ error }` si le fichier est refusé.
 */
export function readAvatarFile(
  entry: FormDataEntryValue | null,
): File | null | { error: string } {
  if (!(entry instanceof File) || entry.size === 0) return null;
  if (!ALLOWED_AVATAR_TYPES.includes(entry.type)) {
    return { error: "Format d'image non supporté (PNG, JPEG, WebP ou GIF)." };
  }
  if (entry.size > MAX_AVATAR_BYTES) {
    return { error: "L'image dépasse la taille maximale de 5 Mo." };
  }
  return entry;
}

/**
 * Envoie l'avatar sous {shop_id}/{user_id}.{ext} en remplaçant l'ancien
 * fichier (y compris s'il avait une autre extension), et renvoie son URL
 * publique. Un paramètre `?v=` casse le cache navigateur/CDN, puisque le
 * chemin reste identique d'une photo à l'autre.
 */
export async function uploadAvatar(
  supabaseAdmin: SupabaseClient,
  shopId: string,
  userId: string,
  file: File,
): Promise<{ url: string } | { error: string }> {
  const bucket = supabaseAdmin.storage.from("avatars");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${shopId}/${userId}.${ext}`;

  const { data: existing } = await bucket.list(shopId, { search: userId });
  const stale = (existing ?? [])
    .map((o) => `${shopId}/${o.name}`)
    .filter((p) => p !== path && p.startsWith(`${shopId}/${userId}.`));
  if (stale.length > 0) await bucket.remove(stale);

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await bucket.upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (error) return { error: "Échec de l'envoi de l'avatar : " + error.message };

  const publicUrl = bucket.getPublicUrl(path).data.publicUrl;
  return { url: `${publicUrl}?v=${Date.now()}` };
}

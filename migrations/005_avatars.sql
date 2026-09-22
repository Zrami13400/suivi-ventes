-- ============================================================
-- Migration 005 — Avatars vendeurs (colonne + bucket Storage + RLS)
-- ============================================================
-- À exécuter une fois dans le SQL Editor de Supabase, après
-- 004_fix_recalculer_prime_jour.sql.
--
-- Résumé :
--  1. profiles.avatar_url : URL publique de l'avatar (nullable — repli sur
--     les initiales colorées côté application quand absent).
--  2. Bucket Storage "avatars" (public en lecture).
--  3. Politiques RLS sur storage.objects : lecture publique, écriture
--     (insert/update/delete) réservée aux admins de la boutique
--     correspondant au 1er segment du chemin de l'objet.
--
-- Convention de chemin : les fichiers sont stockés sous
--   {shop_id}/{profile_id}.{ext}
-- C'est ce 1er segment (storage.foldername(name)[1]) que les politiques
-- comparent au shop_id de l'admin appelant.
--
-- En pratique, l'upload passe par /api/admin/create-seller côté serveur
-- avec la clé service_role (qui contourne complètement ces politiques) ;
-- elles ne servent que de garde-fou si un client interrogeait Storage
-- directement.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. profiles.avatar_url
-- ------------------------------------------------------------
alter table profiles add column if not exists avatar_url text;

-- ------------------------------------------------------------
-- 2. Bucket "avatars" (idempotent)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 3. Politiques RLS sur storage.objects, limitées au bucket "avatars"
-- ------------------------------------------------------------
drop policy if exists avatars_public_select on storage.objects;
create policy avatars_public_select on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_admin_insert on storage.objects;
create policy avatars_admin_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.shop_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists avatars_admin_update on storage.objects;
create policy avatars_admin_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.shop_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists avatars_admin_delete on storage.objects;
create policy avatars_admin_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.shop_id::text = (storage.foldername(name))[1]
    )
  );

commit;

-- ============================================================
-- Étapes manuelles éventuelles
-- ============================================================
-- Si `insert into storage.buckets` échoue pour manque de droits dans votre
-- projet, créez le bucket à la main : Dashboard Supabase → Storage →
-- "New bucket" → nom "avatars" → cocher "Public bucket", puis relancez
-- uniquement la section 3 (politiques) de cette migration.
--
-- Ajoutez également SUPABASE_SERVICE_ROLE_KEY dans .env.local (Dashboard →
-- Project Settings → API → "service_role" secret). Cette clé ne doit
-- JAMAIS être préfixée NEXT_PUBLIC_ et ne doit jamais être exposée au
-- navigateur.
-- ============================================================

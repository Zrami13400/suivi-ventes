-- ============================================================
-- Migration 011 — Politiques RLS des tables du schéma initial
-- ============================================================
-- À exécuter une fois dans le SQL Editor de Supabase, après
-- 010_recalcul_annulations.sql.
--
-- Les politiques de profiles, shops, ventes (lecture perso / insertion),
-- primes_journalieres, objectifs et regles_primes venaient du schema.sql
-- initial, qui n'est pas versionné : elles n'existaient qu'en base. Cette
-- migration les réécrit ici pour que le dépôt soit la source de vérité.
--
-- Pour ces tables, TOUTES les politiques existantes sont supprimées puis
-- recréées (quel que soit leur nom d'origine), sauf celles déjà définies
-- par une migration versionnée :
--   - ventes_select_boutique     (002)
--   - ventes_update_vendeur_jour (008)
--   - ventes_update_admin        (008)
--
-- Avant d'exécuter, gardez une trace de l'existant :
--   select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('profiles', 'shops', 'ventes', 'primes_journalieres',
--                       'objectifs', 'regles_primes')
--   order by tablename, policyname;
--
-- Règles appliquées :
--  - profiles            : lecture de son profil et de ceux de sa boutique.
--                          Aucune écriture côté client : création, édition et
--                          suppression passent par la clé service_role
--                          (/api/admin/*, /api/profile/update). Pas de
--                          politique UPDATE, sinon un vendeur pourrait
--                          modifier son propre role / shop_id.
--  - shops               : lecture de sa boutique.
--  - ventes              : insertion de ses propres ventes dans sa boutique.
--                          Lecture boutique (002), annulation (008). Aucune
--                          suppression (008).
--  - primes_journalieres : chaque vendeur lit ses lignes, l'admin celles de
--                          sa boutique. Écriture uniquement via les fonctions
--                          security definer de recalcul.
--  - objectifs           : un vendeur lit les objectifs boutique et les siens ;
--                          l'admin lit et gère tous ceux de sa boutique.
--  - regles_primes       : lecture par tout membre de la boutique (estimation
--                          de prime), écriture réservée aux admins.
--  - progression_objectifs (vue) : security_invoker, pour qu'elle respecte
--                          la RLS des tables qu'elle lit.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. Fonctions utilitaires
-- ------------------------------------------------------------
-- security definer : lisent profiles sans repasser par sa RLS, ce qui évite
-- la récursion infinie dans les politiques de profiles elle-même.
create or replace function auth_shop_id()
returns uuid as $$
  select shop_id from profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create or replace function auth_is_admin()
returns boolean as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$ language sql stable security definer set search_path = public;

grant execute on function auth_shop_id()  to authenticated;
grant execute on function auth_is_admin() to authenticated;

-- ------------------------------------------------------------
-- 1. Purge des politiques non versionnées
-- ------------------------------------------------------------
do $$
declare
  pol record;
begin
  for pol in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'shops', 'ventes', 'primes_journalieres',
                        'objectifs', 'regles_primes')
      and policyname not in ('ventes_select_boutique',
                             'ventes_update_vendeur_jour',
                             'ventes_update_admin')
  loop
    execute format('drop policy %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;

alter table profiles            enable row level security;
alter table shops               enable row level security;
alter table ventes              enable row level security;
alter table primes_journalieres enable row level security;
alter table objectifs           enable row level security;
alter table regles_primes       enable row level security;

-- ------------------------------------------------------------
-- 2. PROFILES
-- ------------------------------------------------------------
create policy profiles_select_boutique on profiles
  for select using (
    id = auth.uid() or shop_id = auth_shop_id()
  );

-- ------------------------------------------------------------
-- 3. SHOPS
-- ------------------------------------------------------------
create policy shops_select_own on shops
  for select using (id = auth_shop_id());

-- ------------------------------------------------------------
-- 4. VENTES — insertion (lecture : 002, annulation : 008)
-- ------------------------------------------------------------
create policy ventes_insert_own on ventes
  for insert with check (
    vendeur_id = auth.uid() and shop_id = auth_shop_id()
  );

-- ------------------------------------------------------------
-- 5. PRIMES_JOURNALIERES
-- ------------------------------------------------------------
create policy pj_select_own on primes_journalieres
  for select using (vendeur_id = auth.uid());

create policy pj_select_admin on primes_journalieres
  for select using (
    auth_is_admin()
    and exists (select 1 from profiles p
                where p.id = primes_journalieres.vendeur_id
                  and p.shop_id = auth_shop_id())
  );

-- ------------------------------------------------------------
-- 6. OBJECTIFS
-- ------------------------------------------------------------
create policy objectifs_select on objectifs
  for select using (
    shop_id = auth_shop_id()
    and (vendeur_id is null or vendeur_id = auth.uid() or auth_is_admin())
  );

create policy objectifs_admin_write on objectifs
  for all using (
    auth_is_admin() and shop_id = auth_shop_id()
  ) with check (
    auth_is_admin() and shop_id = auth_shop_id()
    and (vendeur_id is null
         or exists (select 1 from profiles p
                    where p.id = objectifs.vendeur_id
                      and p.shop_id = objectifs.shop_id))
  );

-- ------------------------------------------------------------
-- 7. REGLES_PRIMES
-- ------------------------------------------------------------
create policy regles_primes_select on regles_primes
  for select using (shop_id = auth_shop_id());

create policy regles_primes_admin_write on regles_primes
  for all using (
    auth_is_admin() and shop_id = auth_shop_id()
  ) with check (
    auth_is_admin() and shop_id = auth_shop_id()
  );

-- ------------------------------------------------------------
-- 8. VUE progression_objectifs — soumise à la RLS de l'appelant
-- ------------------------------------------------------------
-- Par défaut une vue s'exécute avec les droits de son propriétaire et
-- contourne la RLS : tout utilisateur connecté lisait la progression de
-- toutes les boutiques. En security_invoker, objectifs / ventes / planning
-- sont filtrés par les politiques ci-dessus (un vendeur voit les objectifs
-- boutique et les siens, avec ses propres jours travaillés).
-- À reposer si une migration future recrée la vue.
alter view progression_objectifs set (security_invoker = true);

commit;

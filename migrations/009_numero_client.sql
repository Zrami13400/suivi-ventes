-- ============================================================
-- Migration 009 — Numéro client sur les ventes
-- ============================================================
-- À exécuter une fois dans le SQL Editor de Supabase, après
-- 008_statut_ventes.sql.
--
-- Résumé :
--  1. ventes.numero_client (text, nullable). Saisi pour les ventes Freebox
--     (facultatif), inutilisé pour les autres types d'acte.
--  2. Index pour la recherche par numéro client (page Mes ventes).
--  3. Garde-fou BEFORE UPDATE (008) : numero_client ne peut pas être modifié
--     après saisie, comme les autres champs de la vente.
--
-- Pas de changement RLS : les politiques existantes sur ventes couvrent la
-- nouvelle colonne.
-- ============================================================

begin;

-- ============================================================
-- 1. COLONNE
-- ============================================================
alter table ventes
  add column if not exists numero_client text;

-- ============================================================
-- 2. INDEX (recherche par vendeur + numéro client)
-- ============================================================
create index if not exists ventes_vendeur_numero_client_idx
  on ventes (vendeur_id, numero_client)
  where numero_client is not null;

-- ============================================================
-- 3. GARDE-FOU SUR LES MISES À JOUR
-- ============================================================
-- Identique à la migration 008, avec numero_client dans les champs figés.
create or replace function trg_vente_before_update()
returns trigger as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if row(new.vendeur_id, new.shop_id, new.acte_type, new.quantity,
         new.has_mcafee, new.has_assurance, new.has_coque, new.has_reprise,
         new.has_garantie, new.options, new.sous_type_id, new.modele_id,
         new.created_at, new.numero_client)
     is distinct from
     row(old.vendeur_id, old.shop_id, old.acte_type, old.quantity,
         old.has_mcafee, old.has_assurance, old.has_coque, old.has_reprise,
         old.has_garantie, old.options, old.sous_type_id, old.modele_id,
         old.created_at, old.numero_client)
  then
    raise exception 'Une vente ne peut pas être modifiée, seulement annulée.';
  end if;

  if old.statut = 'annulée' then
    raise exception 'Cette vente est déjà annulée.';
  end if;

  if new.statut <> 'annulée' then
    raise exception 'Seule l''annulation d''une vente est autorisée.';
  end if;

  new.annulee_le  := now();
  new.annulee_par := auth.uid();
  new.motif_annulation := nullif(btrim(coalesce(new.motif_annulation, '')), '');
  return new;
end;
$$ language plpgsql;

commit;

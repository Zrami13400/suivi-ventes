-- ============================================================
-- Migration 010 — Recalcul après annulation (filet de sécurité)
-- ============================================================
-- À exécuter une fois dans le SQL Editor de Supabase, après
-- 009_numero_client.sql.
--
-- La migration 008 pose déjà le trigger AFTER UPDATE OF statut et filtre
-- recalculer_prime_jour / recalculer_primes_mois / progression_objectifs
-- sur statut = 'validée'. Celle-ci :
--  1. Recrée le trigger AFTER UPDATE (idempotent) au cas où il manquerait.
--  2. Ajoute recalculer_primes_mois_complet(shop, date) : recalcule le mois
--     ET chaque jour du mois pour chaque vendeur (recalculer_primes_boutique
--     ne recalcule que les primes journalières du jour de référence).
--  3. Rattrapage : recalcul complet du mois en cours pour toutes les
--     boutiques.
--
-- Requêtes de vérification en bas du fichier.
-- ============================================================

begin;

-- ============================================================
-- 1. TRIGGER AFTER UPDATE — recalcul quand le statut change
-- ============================================================
create or replace function trg_vente_after_update()
returns trigger as $$
begin
  if new.statut is distinct from old.statut then
    perform recalculer_prime_jour(new.vendeur_id, new.created_at::date);
    perform recalculer_primes_mois(new.shop_id, new.created_at::date);
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_vente_after_update on ventes;
create trigger trg_vente_after_update
  after update of statut on ventes
  for each row execute function trg_vente_after_update();

-- ============================================================
-- 2. RECALCUL COMPLET D'UN MOIS (mensuel + chaque jour)
-- ============================================================
create or replace function recalculer_primes_mois_complet(p_shop_id uuid, p_ref date default current_date)
returns void as $$
declare
  m_start date := date_trunc('month', p_ref)::date;
  m_end   date := (date_trunc('month', p_ref) + interval '1 month')::date;
begin
  perform recalculer_primes_mois(p_shop_id, p_ref);

  -- Chaque (vendeur, jour) ayant au moins une vente, validée ou annulée :
  -- un jour dont toutes les ventes sont annulées retombe à 0.
  perform recalculer_prime_jour(d.vendeur_id, d.jour)
  from (
    select distinct v.vendeur_id, v.created_at::date as jour
    from ventes v
    where v.shop_id = p_shop_id
      and v.created_at >= m_start and v.created_at < m_end
  ) d;
end;
$$ language plpgsql security definer;

grant execute on function recalculer_primes_mois_complet(uuid, date) to authenticated;

-- ============================================================
-- 3. RATTRAPAGE — mois en cours, toutes les boutiques
-- ============================================================
select recalculer_primes_mois_complet(id, current_date) from shops;

commit;

-- ============================================================
-- Vérifications (à lancer après, résultat attendu indiqué)
-- ============================================================
-- a) Le trigger existe (1 ligne) :
--   select tgname from pg_trigger
--   where tgrelid = 'ventes'::regclass and tgname = 'trg_vente_after_update';
--
-- b) La vue filtre bien sur le statut (true) :
--   select pg_get_viewdef('progression_objectifs') ilike '%statut%';
--
-- c) Aucun écart entre primes_mensuelles et les ventes validées (0 ligne) :
--   select pm.vendeur_id, pm.total_actes, coalesce(sum(v.quantity), 0) as attendu
--   from primes_mensuelles pm
--   left join ventes v on v.vendeur_id = pm.vendeur_id and v.statut = 'validée'
--     and v.created_at >= pm.mois and v.created_at < pm.mois + interval '1 month'
--   where pm.mois = date_trunc('month', current_date)::date
--   group by pm.vendeur_id, pm.total_actes
--   having pm.total_actes <> coalesce(sum(v.quantity), 0);
-- ============================================================

-- ============================================================
-- Migration 004 — Correctif recalculer_prime_jour()
-- ============================================================
-- migrations/003_objectifs_planning_paliers.sql définissait
-- recalculer_prime_jour(uuid, date) avec un INSERT à 5 colonnes cibles
-- (vendeur_id, date, total_ventes, prime_calculee, updated_at) mais une
-- liste SELECT de seulement 4 expressions (le `now()` final manquait) :
--
--   ERROR: 42601: INSERT has more target columns than expressions
--
-- Cette migration ne fait que recréer la fonction avec le `now()` manquant
-- (CREATE OR REPLACE — idempotent, sans effet sur les tables). Aucune autre
-- fonction de la migration 003 n'est affectée.
-- ============================================================

begin;

create or replace function recalculer_prime_jour(p_vendeur uuid, p_date date)
returns void as $$
declare
  v_shop uuid;
begin
  select shop_id into v_shop from profiles where id = p_vendeur;

  insert into primes_journalieres (vendeur_id, date, total_ventes, prime_calculee, updated_at)
  select
    p_vendeur,
    p_date,
    coalesce(sum(v.quantity), 0),
    coalesce(sum(
        v.quantity * coalesce(st.montant_base, rp.montant_par_acte, 0)
      + case when v.has_mcafee    then v.quantity * coalesce(rp.bonus_mcafee, 0)    else 0 end
      + case when v.has_assurance then v.quantity * coalesce(rp.bonus_assurance, 0) else 0 end
    ), 0),
    now()
  from ventes v
  left join sous_types_actes st on st.id = v.sous_type_id
  left join regles_primes rp   on rp.shop_id = v_shop and rp.acte_type = v.acte_type
  where v.vendeur_id = p_vendeur
    and v.created_at::date = p_date
  on conflict (vendeur_id, date)
  do update set total_ventes   = excluded.total_ventes,
                prime_calculee = excluded.prime_calculee,
                updated_at     = now();
end;
$$ language plpgsql security definer;

commit;

-- ============================================================
-- Après avoir exécuté cette migration, relancez le backfill qui avait
-- échoué :
--   select recalculer_primes_boutique(id) from shops;
-- ============================================================

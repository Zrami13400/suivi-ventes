-- ============================================================
-- Migration 002 — Challenges entre vendeurs (FreeKpi)
-- ============================================================
-- Additive : ne modifie aucune table existante. À exécuter une fois
-- dans le SQL Editor de Supabase, après 001_commission_par_acte.sql.
--
-- Un challenge oppose 2 vendeurs (ou plus) de la même boutique sur une
-- métrique (nombre d'actes total, ou un type d'acte précis) pendant une
-- période. Le gagnant reçoit une prime bonus. Le statut (à venir / en
-- cours / terminé) est déduit des dates côté application.
-- ============================================================

begin;

create table if not exists challenges (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops (id) on delete cascade,
  titre           text not null,
  description     text,
  metrique        text not null default 'actes'
                    check (metrique in ('actes', 'Freebox', 'Forfait mobile', 'Téléphone')),
  date_debut      date not null,
  date_fin        date not null,
  participant_ids uuid[] not null default '{}',
  prime_bonus     numeric(10,2) not null default 0,
  created_by      uuid not null references profiles (id),
  created_at      timestamptz not null default now(),
  check (date_fin >= date_debut)
);

create index if not exists challenges_shop_idx on challenges (shop_id);

alter table challenges enable row level security;

-- Lecture : tout membre de la boutique.
drop policy if exists challenges_select on challenges;
create policy challenges_select on challenges
  for select using (
    shop_id in (select shop_id from profiles where id = auth.uid())
  );

-- Écriture : admins de la boutique uniquement.
drop policy if exists challenges_admin_write on challenges;
create policy challenges_admin_write on challenges
  for all using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.shop_id = challenges.shop_id
    )
  ) with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.shop_id = challenges.shop_id
    )
  );

-- ------------------------------------------------------------
-- (Optionnel mais recommandé) — Lecture collective des ventes
-- de la boutique : nécessaire pour le classement et les stats
-- d'équipe de FreeKpi. Les primes, elles, restent privées via
-- leurs propres politiques sur primes_journalieres.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ventes'
      and policyname = 'ventes_select_boutique'
  ) then
    execute $p$
      create policy ventes_select_boutique on ventes
        for select using (
          shop_id in (select shop_id from profiles where id = auth.uid())
        )
    $p$;
  end if;
end $$;

commit;

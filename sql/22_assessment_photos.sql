-- =====================================================================
-- 22_assessment_photos.sql
-- Fotos da anamnese: até 6 por avaliação (4 poses fixas + 2 livres).
-- Bucket privado no Storage + tabela relacional + RLS espelhando as
-- políticas de `assessments` (aluno só lê; professor/owner escrevem).
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bucket privado no Storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assessment-photos', 'assessment-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 2. Tabela assessment_photos
-- slot fixo: 4 poses (frente/costas/lateral_esq/lateral_dir) + 2 livres,
-- para permitir casar automaticamente a mesma pose entre avaliações.
-- storage_path: "<assessment_id>/<slot>.jpg" dentro do bucket acima.
-- ---------------------------------------------------------------------
create table if not exists public.assessment_photos (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  slot          text not null check (slot in ('frente','costas','lateral_esq','lateral_dir','livre_1','livre_2')),
  label         text,
  storage_path  text not null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (assessment_id, slot)
);

comment on table public.assessment_photos is 'Fotos de progresso por avaliação (até 6, por pose/slot fixo).';

create index if not exists idx_assessment_photos_assessment on public.assessment_photos (assessment_id);

alter table public.assessment_photos enable row level security;

-- ---------------------------------------------------------------------
-- 3. Helper: pode acessar a avaliação (leitura ou escrita)?
-- Reaproveita a mesma regra de assessments_select/assessments_write
-- (sql/03_rls.sql + sql/14_invite_staging.sql) para não duplicar lógica
-- entre a tabela e as políticas do Storage.
-- ---------------------------------------------------------------------
create or replace function public.can_access_assessment(p_assessment_id uuid, p_write boolean default false)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.assessments a
    where a.id = p_assessment_id
      and case when p_write
        then (public.is_my_student(a.student_id) or public.is_my_invite(a.invite_id) or public.is_owner())
        else (a.student_id = auth.uid() or public.is_my_student(a.student_id)
              or public.is_my_invite(a.invite_id) or public.is_owner())
      end
  );
$$;

-- ---------------------------------------------------------------------
-- 4. RLS de assessment_photos
-- ---------------------------------------------------------------------
drop policy if exists assessment_photos_select on public.assessment_photos;
create policy assessment_photos_select on public.assessment_photos
  for select to authenticated
  using ( public.can_access_assessment(assessment_id, false) );

drop policy if exists assessment_photos_write on public.assessment_photos;
create policy assessment_photos_write on public.assessment_photos
  for all to authenticated
  using ( public.can_access_assessment(assessment_id, true) )
  with check ( public.can_access_assessment(assessment_id, true) and public.i_have_access() );

-- ---------------------------------------------------------------------
-- 5. RLS do bucket (storage.objects)
-- Caminho do objeto é "<assessment_id>/<slot>.jpg" — o 1º segmento do
-- path é o assessment_id, extraído via storage.foldername(name)[1].
-- ---------------------------------------------------------------------
drop policy if exists assessment_photos_storage_select on storage.objects;
create policy assessment_photos_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assessment-photos'
    and public.can_access_assessment( ((storage.foldername(name))[1])::uuid, false )
  );

-- insert/update exigem i_have_access() (mensalidade do professor em dia),
-- espelhando o WITH CHECK de assessments_write — owner sempre passa.
drop policy if exists assessment_photos_storage_insert on storage.objects;
create policy assessment_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assessment-photos'
    and public.can_access_assessment( ((storage.foldername(name))[1])::uuid, true )
    and (public.is_owner() or public.i_have_access())
  );

drop policy if exists assessment_photos_storage_update on storage.objects;
create policy assessment_photos_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'assessment-photos'
    and public.can_access_assessment( ((storage.foldername(name))[1])::uuid, true )
  )
  with check (
    bucket_id = 'assessment-photos'
    and public.can_access_assessment( ((storage.foldername(name))[1])::uuid, true )
    and (public.is_owner() or public.i_have_access())
  );

drop policy if exists assessment_photos_storage_delete on storage.objects;
create policy assessment_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'assessment-photos'
    and public.can_access_assessment( ((storage.foldername(name))[1])::uuid, true )
  );

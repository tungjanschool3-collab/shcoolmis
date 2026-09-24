-- Multi-tenant foundation: real school memberships, scoped roles and academic years.
-- Apply on staging first and verify the backfill before production.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('platform_owner', 'school_admin', 'admin', 'teacher', 'pending'));

drop trigger if exists school_limit_20 on public.school;

create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id int not null references public.school(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('school_admin', 'teacher')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, user_id)
);

create index if not exists school_memberships_user_idx
  on public.school_memberships(user_id, status);
create index if not exists school_memberships_school_idx
  on public.school_memberships(school_id, role, status);

create table if not exists public.school_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  school_name text not null,
  contact_name text not null default '',
  phone text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  school_id int references public.school(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create or replace function public.handle_school_signup()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  requested_school text := trim(coalesce(new.raw_user_meta_data->>'school_name', ''));
  requested_name text := trim(coalesce(new.raw_user_meta_data->>'contact_name', ''));
  requested_phone text := trim(coalesce(new.raw_user_meta_data->>'phone', ''));
  generated_username text;
begin
  if lower(coalesce(new.email, '')) = 'tiamobew@gmail.com' then
    generated_username := 'tiamobew';
    insert into public.profiles (id, username, full_name, role, is_active)
    values (new.id, generated_username, requested_name, 'platform_owner', true)
    on conflict (id) do update set role = 'platform_owner', school_id = null, is_active = true;
    return new;
  end if;

  if requested_school = '' then
    return new;
  end if;

  generated_username := split_part(coalesce(new.email, new.id::text), '@', 1) || '_' || left(new.id::text, 8);
  insert into public.profiles (id, username, full_name, role, is_active)
  values (new.id, generated_username, requested_name, 'pending', true)
  on conflict (id) do nothing;

  insert into public.school_registrations (user_id, email, school_name, contact_name, phone)
  values (new.id, lower(coalesce(new.email, '')), requested_school, requested_name, requested_phone)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_school_signup on auth.users;
create trigger on_auth_user_school_signup
after insert on auth.users for each row execute function public.handle_school_signup();

create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id int not null references public.school(id) on delete cascade,
  year text not null check (year ~ '^[0-9]{4}$'),
  status text not null default 'active' check (status in ('active', 'closed', 'deleting')),
  starts_on date,
  ends_on date,
  closed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, year)
);

create index if not exists academic_years_school_year_idx
  on public.academic_years(school_id, year desc);

create table if not exists public.academic_year_exports (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  school_id int not null references public.school(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  school_id int references public.school(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.classes add column if not exists academic_year_id uuid
  references public.academic_years(id) on delete restrict;

insert into public.academic_years (school_id, year)
select distinct c.school_id, c.academic_year
from public.classes c
where c.academic_year ~ '^[0-9]{4}$'
on conflict (school_id, year) do nothing;

update public.classes c
set academic_year_id = y.id
from public.academic_years y
where c.academic_year_id is null
  and y.school_id = c.school_id
  and y.year = c.academic_year;

-- Preserve existing users as members of their current school.
insert into public.school_memberships (school_id, user_id, role, status)
select p.school_id, p.id,
       case when p.role = 'admin' then 'school_admin' else 'teacher' end,
       case when p.is_active then 'active' else 'suspended' end
from public.profiles p
where p.school_id is not null
on conflict (school_id, user_id) do update
set role = excluded.role, status = excluded.status, updated_at = now();

-- Promote the requested platform owner when that verified Auth account exists.
insert into public.profiles (id, username, full_name, role, is_active)
select u.id, 'tiamobew', 'tiamobew', 'platform_owner', true
from auth.users u
where lower(u.email) = 'tiamobew@gmail.com'
on conflict (id) do update set role = 'platform_owner', school_id = null, is_active = true;
update public.profiles p
set role = 'platform_owner', school_id = null
from auth.users u
where p.id = u.id and lower(u.email) = 'tiamobew@gmail.com';

update public.profiles
set school_id = (select min(id) from public.school)
where role = 'admin' and school_id is null and username = 'admin'
  and exists (select 1 from public.school);
update public.profiles set role = 'school_admin'
where role = 'admin' and school_id is not null;
insert into public.school_memberships (school_id, user_id, role, status)
select school_id, id, 'school_admin', case when is_active then 'active' else 'suspended' end
from public.profiles where role = 'school_admin' and school_id is not null
on conflict (school_id, user_id) do update set role = 'school_admin', status = excluded.status, updated_at = now();

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_platform_owner()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = (select auth.uid()) and p.role = 'platform_owner' and p.is_active
      and u.email_confirmed_at is not null
  );
$$;

create or replace function private.has_school_role(target_school_id int, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select private.is_platform_owner() or exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid())
      and m.school_id = target_school_id
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;

create or replace function private.can_access_class(target_class_id uuid, write_access boolean default false)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select private.is_platform_owner() or exists (
    select 1
    from public.classes c
    join public.school_memberships m on m.school_id = c.school_id
    where c.id = target_class_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        m.role = 'school_admin'
        or (m.role = 'teacher' and c.homeroom_teacher_id = (select auth.uid()))
      )
  );
$$;

revoke all on function private.is_platform_owner() from public;
revoke all on function private.has_school_role(int, text[]) from public;
revoke all on function private.can_access_class(uuid, boolean) from public;
grant execute on function private.is_platform_owner() to authenticated;
grant execute on function private.has_school_role(int, text[]) to authenticated;
grant execute on function private.can_access_class(uuid, boolean) to authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select private.is_platform_owner();
$$;

alter table public.school_memberships enable row level security;
alter table public.school_registrations enable row level security;
alter table public.academic_years enable row level security;
alter table public.academic_year_exports enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists memberships_read on public.school_memberships;
create policy memberships_read on public.school_memberships for select to authenticated
using (
  private.is_platform_owner()
  or user_id = (select auth.uid())
  or private.has_school_role(school_id, array['school_admin'])
);

drop policy if exists memberships_manage on public.school_memberships;
create policy memberships_manage on public.school_memberships for all to authenticated
using (private.has_school_role(school_id, array['school_admin']))
with check (
  private.has_school_role(school_id, array['school_admin'])
  and role in ('school_admin', 'teacher')
);

drop policy if exists registrations_own_insert on public.school_registrations;
create policy registrations_own_insert on public.school_registrations for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'pending');
drop policy if exists registrations_own_read on public.school_registrations;
create policy registrations_own_read on public.school_registrations for select to authenticated
using (user_id = (select auth.uid()) or private.is_platform_owner());
drop policy if exists registrations_owner_manage on public.school_registrations;
create policy registrations_owner_manage on public.school_registrations for all to authenticated
using (private.is_platform_owner()) with check (private.is_platform_owner());

drop policy if exists academic_years_read on public.academic_years;
create policy academic_years_read on public.academic_years for select to authenticated
using (private.has_school_role(school_id, array['school_admin', 'teacher']));
drop policy if exists academic_years_manage on public.academic_years;
create policy academic_years_manage on public.academic_years for all to authenticated
using (private.has_school_role(school_id, array['school_admin']))
with check (private.has_school_role(school_id, array['school_admin']));

create policy academic_year_exports_admin on public.academic_year_exports for all to authenticated
using (private.has_school_role(school_id, array['school_admin']))
with check (private.has_school_role(school_id, array['school_admin']) and created_by = (select auth.uid()));
create policy audit_logs_read on public.audit_logs for select to authenticated
using (private.has_school_role(school_id, array['school_admin']));

-- Replace global-admin policies on tenant roots.
drop policy if exists school_read on public.school;
create policy school_read on public.school for select to authenticated
using (private.has_school_role(id, array['school_admin', 'teacher']));
drop policy if exists school_admin on public.school;
create policy school_admin on public.school for update to authenticated
using (private.has_school_role(id, array['school_admin']))
with check (private.has_school_role(id, array['school_admin']));
create policy school_platform_insert on public.school for insert to authenticated
with check (private.is_platform_owner());
create policy school_platform_delete on public.school for delete to authenticated
using (private.is_platform_owner());

drop policy if exists classes_read on public.classes;
create policy classes_read on public.classes for select to authenticated
using (private.can_access_class(id));
drop policy if exists classes_admin on public.classes;
drop policy if exists classes_owner_update on public.classes;
create policy classes_insert on public.classes for insert to authenticated
with check (private.has_school_role(school_id, array['school_admin']));
create policy classes_update on public.classes for update to authenticated
using (private.can_access_class(id, true)) with check (private.can_access_class(id, true));
create policy classes_delete on public.classes for delete to authenticated
using (private.has_school_role(school_id, array['school_admin']));

drop policy if exists gc_read on public.grade_criteria;
create policy gc_read on public.grade_criteria for select to authenticated
using (private.has_school_role(school_id, array['school_admin', 'teacher']));
drop policy if exists gc_admin on public.grade_criteria;
create policy gc_admin on public.grade_criteria for all to authenticated
using (private.has_school_role(school_id, array['school_admin']))
with check (private.has_school_role(school_id, array['school_admin']));

-- Profiles can no longer update their own role/school through the Data API.
drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_scoped_read on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or private.is_platform_owner()
  or exists (
    select 1 from public.school_memberships mine
    join public.school_memberships theirs on theirs.school_id = mine.school_id
    where mine.user_id = (select auth.uid()) and mine.status = 'active'
      and mine.role = 'school_admin' and theirs.user_id = profiles.id
  )
);

-- Keep the existing child-table policies, but make their helpers tenant aware.
create or replace function public.owns_class(cid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select private.can_access_class(cid, true);
$$;

create or replace function public.owns_student(sid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.students s
    where s.id = sid and private.can_access_class(s.class_id, true)
  );
$$;

create or replace function public.owns_transfer_subject(tid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.transfer_subjects t
    where t.id = tid and private.can_access_class(t.class_id, true)
  );
$$;

create or replace function private.valid_subject_score(target_student uuid, target_subject uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.students s join public.subjects sub on sub.class_id = s.class_id
    where s.id = target_student and sub.id = target_subject and private.can_access_class(s.class_id, true)
  );
$$;
create or replace function private.valid_assessment_score(target_student uuid, target_item uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.students s join public.assessment_items i on i.class_id = s.class_id
    where s.id = target_student and i.id = target_item and private.can_access_class(s.class_id, true)
  );
$$;
create or replace function private.valid_activity_result(target_student uuid, target_activity uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.students s join public.activities a on a.class_id = s.class_id
    where s.id = target_student and a.id = target_activity and private.can_access_class(s.class_id, true)
  );
$$;
create or replace function private.valid_transfer_source(target_transfer uuid, target_subject uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.transfer_subjects t join public.subjects s on s.class_id = t.class_id
    where t.id = target_transfer and s.id = target_subject and private.can_access_class(t.class_id, true)
  );
$$;
grant execute on function private.valid_subject_score(uuid, uuid) to authenticated;
grant execute on function private.valid_assessment_score(uuid, uuid) to authenticated;
grant execute on function private.valid_activity_result(uuid, uuid) to authenticated;
grant execute on function private.valid_transfer_source(uuid, uuid) to authenticated;

drop policy if exists ss_rw on public.subject_scores;
create policy ss_rw on public.subject_scores for all to authenticated
using (private.valid_subject_score(student_id, subject_id))
with check (private.valid_subject_score(student_id, subject_id));
drop policy if exists asc_rw on public.assessment_scores;
create policy asc_rw on public.assessment_scores for all to authenticated
using (private.valid_assessment_score(student_id, item_id))
with check (private.valid_assessment_score(student_id, item_id));
drop policy if exists ar_rw on public.activity_results;
create policy ar_rw on public.activity_results for all to authenticated
using (private.valid_activity_result(student_id, activity_id))
with check (private.valid_activity_result(student_id, activity_id));
drop policy if exists tsrc_rw on public.transfer_sources;
create policy tsrc_rw on public.transfer_sources for all to authenticated
using (private.valid_transfer_source(transfer_subject_id, subject_id))
with check (private.valid_transfer_source(transfer_subject_id, subject_id));

-- Enforce the ten-year rule in the database, including concurrent inserts.
create or replace function public.enforce_academic_year_limit()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(new.school_id);
  if (select count(*) from public.academic_years where school_id = new.school_id) >= 10 then
    raise exception 'โรงเรียนเก็บได้สูงสุด 10 ปีการศึกษา';
  end if;
  return new;
end;
$$;

drop trigger if exists academic_year_limit_10 on public.academic_years;
create trigger academic_year_limit_10 before insert on public.academic_years
for each row execute function public.enforce_academic_year_limit();

grant select, insert, update, delete on public.school_memberships to authenticated;
grant select, insert, update, delete on public.school_registrations to authenticated;
grant select, insert, update, delete on public.academic_years to authenticated;
grant select, insert on public.academic_year_exports to authenticated;
grant select on public.audit_logs to authenticated;

create or replace function public.approve_school_registration(registration_id uuid, initial_year text)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  request_row public.school_registrations%rowtype;
  new_school_id int;
begin
  if not private.is_platform_owner() then raise exception 'ไม่มีสิทธิ์อนุมัติโรงเรียน'; end if;
  if initial_year !~ '^[0-9]{4}$' then raise exception 'ปีการศึกษาไม่ถูกต้อง'; end if;

  select * into request_row from public.school_registrations
  where id = registration_id and status = 'pending' for update;
  if not found then raise exception 'ไม่พบคำขอที่รออนุมัติ'; end if;
  if not exists (select 1 from auth.users where id = request_row.user_id and email_confirmed_at is not null) then
    raise exception 'ผู้สมัครยังไม่ได้ยืนยันอีเมล';
  end if;

  insert into public.school(name, academic_year) values (request_row.school_name, initial_year)
  returning id into new_school_id;
  insert into public.school_memberships(school_id, user_id, role, status)
  values (new_school_id, request_row.user_id, 'school_admin', 'active');
  insert into public.academic_years(school_id, year, created_by)
  values (new_school_id, initial_year, (select auth.uid()));
  update public.profiles set role = 'school_admin', school_id = new_school_id, is_active = true
  where id = request_row.user_id;
  update public.school_registrations
  set status = 'approved', school_id = new_school_id,
      reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = registration_id;
  return new_school_id;
end;
$$;
revoke all on function public.approve_school_registration(uuid, text) from public;
grant execute on function public.approve_school_registration(uuid, text) to authenticated;

create or replace function public.delete_exported_academic_year(target_year_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_year public.academic_years%rowtype;
begin
  select * into target_year from public.academic_years where id = target_year_id for update;
  if not found then raise exception 'ไม่พบปีการศึกษา'; end if;
  if not private.has_school_role(target_year.school_id, array['school_admin']) then raise exception 'ไม่มีสิทธิ์ลบปีการศึกษา'; end if;
  if not exists (
    select 1 from public.academic_year_exports e
    where e.academic_year_id = target_year_id and e.status = 'completed'
      and e.created_at > now() - interval '24 hours'
  ) then raise exception 'ต้องดาวน์โหลดข้อมูลสำรองภายใน 24 ชั่วโมงก่อนลบ'; end if;

  update public.academic_years set status = 'deleting' where id = target_year_id;
  delete from public.classes where academic_year_id = target_year_id and school_id = target_year.school_id;
  insert into public.audit_logs(school_id, actor_id, action, entity_type, entity_id, details)
  values (target_year.school_id, (select auth.uid()), 'delete', 'academic_year', target_year_id::text, jsonb_build_object('year', target_year.year));
  delete from public.academic_years where id = target_year_id;
end;
$$;
revoke all on function public.delete_exported_academic_year(uuid) from public;
grant execute on function public.delete_exported_academic_year(uuid) to authenticated;

-- Logos remain publicly readable for printed reports; all writes are tenant scoped.
drop policy if exists assets_auth_write on storage.objects;
drop policy if exists assets_auth_update on storage.objects;
drop policy if exists assets_auth_delete on storage.objects;
create policy assets_school_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'assets'
  and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and private.has_school_role(((storage.foldername(name))[1])::int, array['school_admin'])
);
create policy assets_school_update on storage.objects for update to authenticated
using (
  bucket_id = 'assets' and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and private.has_school_role(((storage.foldername(name))[1])::int, array['school_admin'])
)
with check (
  bucket_id = 'assets' and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and private.has_school_role(((storage.foldername(name))[1])::int, array['school_admin'])
);
create policy assets_school_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'assets' and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and private.has_school_role(((storage.foldername(name))[1])::int, array['school_admin'])
);

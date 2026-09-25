-- Learning outcomes: per-subject/per-term indicators and draft scores.

create table if not exists public.learning_outcome_configs (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  term smallint not null check (term in (1, 2)),
  target_max numeric(8,2) not null default 70 check (target_max > 0),
  calculation_method text not null default 'proportional'
    check (calculation_method in ('proportional', 'weighted')),
  status text not null default 'draft' check (status in ('draft', 'locked')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, term)
);

create table if not exists public.learning_outcome_indicators (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references public.learning_outcome_configs(id) on delete cascade,
  order_no smallint not null check (order_no between 1 and 10),
  code text not null,
  title text not null check (length(trim(title)) > 0),
  max_score numeric(8,2) not null check (max_score > 0),
  weight_percent numeric(6,2) check (weight_percent is null or weight_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (config_id, order_no),
  unique (config_id, code)
);

create table if not exists public.learning_outcome_scores (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  indicator_id uuid not null references public.learning_outcome_indicators(id) on delete cascade,
  score numeric(8,2) not null check (score >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (student_id, indicator_id)
);

create table if not exists public.learning_outcome_quality_levels (
  id uuid primary key default gen_random_uuid(),
  school_id int not null references public.school(id) on delete cascade,
  code text not null check (code in ('beginner', 'developing', 'proficient', 'expert')),
  label text not null,
  min_percent numeric(6,2) not null check (min_percent between 0 and 100),
  sort smallint not null check (sort between 1 and 4),
  updated_at timestamptz not null default now(),
  unique (school_id, code),
  unique (school_id, sort)
);

create index if not exists learning_outcome_configs_subject_term_idx
  on public.learning_outcome_configs(subject_id, term);
create index if not exists learning_outcome_indicators_config_idx
  on public.learning_outcome_indicators(config_id, order_no);
create index if not exists learning_outcome_scores_indicator_idx
  on public.learning_outcome_scores(indicator_id, student_id);
create index if not exists learning_outcome_scores_student_idx
  on public.learning_outcome_scores(student_id);

insert into public.learning_outcome_quality_levels (school_id, code, label, min_percent, sort)
select s.id, defaults.code, defaults.label, defaults.min_percent, defaults.sort
from public.school s
cross join (values
  ('beginner', 'เริ่มต้น', 0::numeric, 1::smallint),
  ('developing', 'พัฒนา', 50::numeric, 2::smallint),
  ('proficient', 'ชำนาญ', 65::numeric, 3::smallint),
  ('expert', 'เชี่ยวชาญ', 80::numeric, 4::smallint)
) as defaults(code, label, min_percent, sort)
on conflict (school_id, code) do nothing;

create or replace function private.can_access_learning_outcome_config(target_config uuid, write_access boolean default false)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.learning_outcome_configs c
    join public.subjects sub on sub.id = c.subject_id
    where c.id = target_config and private.can_access_class(sub.class_id, write_access)
  );
$$;

create or replace function private.valid_learning_outcome_score(target_student uuid, target_indicator uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.students st
    join public.learning_outcome_indicators i on i.id = target_indicator
    join public.learning_outcome_configs c on c.id = i.config_id
    join public.subjects sub on sub.id = c.subject_id and sub.class_id = st.class_id
    where st.id = target_student and private.can_access_class(st.class_id, true)
  );
$$;

revoke all on function private.can_access_learning_outcome_config(uuid, boolean) from public;
revoke all on function private.valid_learning_outcome_score(uuid, uuid) from public;
grant execute on function private.can_access_learning_outcome_config(uuid, boolean) to authenticated;
grant execute on function private.valid_learning_outcome_score(uuid, uuid) to authenticated;

create or replace function public.validate_learning_outcome_score()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  allowed_max numeric;
  config_status text;
begin
  select i.max_score, c.status into allowed_max, config_status
  from public.learning_outcome_indicators i
  join public.learning_outcome_configs c on c.id = i.config_id
  where i.id = new.indicator_id;
  if config_status = 'locked' then raise exception 'ชุดตัวชี้วัดถูกล็อกแล้ว'; end if;
  if new.score > allowed_max then raise exception 'คะแนนต้องไม่เกินคะแนนเต็ม %', allowed_max; end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create or replace function public.protect_scored_learning_outcome_indicator()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.learning_outcome_scores s where s.indicator_id = old.id) then
    if tg_op = 'DELETE' then
      raise exception 'ลบตัวชี้วัดที่มีคะแนนแล้วไม่ได้';
    end if;
    if new.max_score is distinct from old.max_score or new.config_id is distinct from old.config_id then
      raise exception 'เปลี่ยนคะแนนเต็มหรือภาคเรียนของตัวชี้วัดที่มีคะแนนแล้วไม่ได้';
    end if;
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists validate_learning_outcome_score on public.learning_outcome_scores;
create trigger validate_learning_outcome_score before insert or update on public.learning_outcome_scores
for each row execute function public.validate_learning_outcome_score();

drop trigger if exists protect_scored_learning_outcome_indicator on public.learning_outcome_indicators;
create trigger protect_scored_learning_outcome_indicator before update or delete on public.learning_outcome_indicators
for each row execute function public.protect_scored_learning_outcome_indicator();

alter table public.learning_outcome_configs enable row level security;
alter table public.learning_outcome_indicators enable row level security;
alter table public.learning_outcome_scores enable row level security;
alter table public.learning_outcome_quality_levels enable row level security;

create policy learning_outcome_configs_read on public.learning_outcome_configs for select to authenticated
using (private.can_access_learning_outcome_config(id));
create policy learning_outcome_configs_insert on public.learning_outcome_configs for insert to authenticated
with check (exists (select 1 from public.subjects s where s.id = subject_id and private.can_access_class(s.class_id, true)));
create policy learning_outcome_configs_update on public.learning_outcome_configs for update to authenticated
using (private.can_access_learning_outcome_config(id, true))
with check (private.can_access_learning_outcome_config(id, true));
create policy learning_outcome_configs_delete on public.learning_outcome_configs for delete to authenticated
using (private.can_access_learning_outcome_config(id, true));

create policy learning_outcome_indicators_read on public.learning_outcome_indicators for select to authenticated
using (private.can_access_learning_outcome_config(config_id));
create policy learning_outcome_indicators_insert on public.learning_outcome_indicators for insert to authenticated
with check (private.can_access_learning_outcome_config(config_id, true));
create policy learning_outcome_indicators_update on public.learning_outcome_indicators for update to authenticated
using (private.can_access_learning_outcome_config(config_id, true))
with check (private.can_access_learning_outcome_config(config_id, true));
create policy learning_outcome_indicators_delete on public.learning_outcome_indicators for delete to authenticated
using (private.can_access_learning_outcome_config(config_id, true));

create policy learning_outcome_scores_read on public.learning_outcome_scores for select to authenticated
using (private.valid_learning_outcome_score(student_id, indicator_id));
create policy learning_outcome_scores_insert on public.learning_outcome_scores for insert to authenticated
with check (private.valid_learning_outcome_score(student_id, indicator_id));
create policy learning_outcome_scores_update on public.learning_outcome_scores for update to authenticated
using (private.valid_learning_outcome_score(student_id, indicator_id))
with check (private.valid_learning_outcome_score(student_id, indicator_id));
create policy learning_outcome_scores_delete on public.learning_outcome_scores for delete to authenticated
using (private.valid_learning_outcome_score(student_id, indicator_id));

create policy learning_outcome_quality_read on public.learning_outcome_quality_levels for select to authenticated
using (private.has_school_role(school_id, array['school_admin', 'teacher']));
create policy learning_outcome_quality_manage on public.learning_outcome_quality_levels for all to authenticated
using (private.has_school_role(school_id, array['school_admin']))
with check (private.has_school_role(school_id, array['school_admin']));

grant select, insert, update, delete on public.learning_outcome_configs to authenticated;
grant select, insert, update, delete on public.learning_outcome_indicators to authenticated;
grant select, insert, update, delete on public.learning_outcome_scores to authenticated;
grant select, insert, update, delete on public.learning_outcome_quality_levels to authenticated;


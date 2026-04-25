-- =============================================================================
-- Agile FJU Handup: complete database schema (squashed from supabase/migrations)
-- =============================================================================
-- For a NEW empty Supabase project: paste in SQL Editor and Run once.
--
-- Do NOT run on a database that already has these tables from migrations (duplicate objects). For day-to-day work, use: supabase db push
--
-- After this script: create users in Authentication, then insert public.profiles.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  role text not null check (role in ('teacher', 'student', 'admin')),
  must_change_password boolean not null default false,
  student_id text unique
);

create index if not exists idx_profiles_role on public.profiles (role);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  course_code text not null,
  is_active boolean not null default false,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (teacher_id, course_code)
);

create index if not exists idx_courses_teacher on public.courses (teacher_id);
create index if not exists idx_courses_active on public.courses (teacher_id, is_active);

create table if not exists public.course_students (
  course_id uuid not null references public.courses (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  primary key (course_id, student_id)
);

create index if not exists idx_course_students_student on public.course_students (student_id);

create table if not exists public.hand_raises (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (course_id, student_id)
);

create index if not exists idx_hand_raises_course_order on public.hand_raises (course_id, created_at asc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table if exists public.profiles enable row level security;
alter table if exists public.courses enable row level security;
alter table if exists public.course_students enable row level security;
alter table if exists public.hand_raises enable row level security;

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER, non-recursive RLS checks)
-- ---------------------------------------------------------------------------

create or replace function public.is_teacher_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.role = 'teacher'
  );
$$;

create or replace function public.is_teacher_of_course(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.courses c
    where c.id = target_course_id
      and c.teacher_id = auth.uid()
  );
$$;

create or replace function public.is_student_enrolled(
  target_course_id uuid,
  target_student_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.course_students cs
    where cs.course_id = target_course_id
      and cs.student_id = target_student_id
  );
$$;

create or replace function public.is_teacher_of_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.course_students cs
    join public.courses c on c.id = cs.course_id
    where cs.student_id = target_student_id
      and c.teacher_id = auth.uid()
  );
$$;

create or replace function public.are_classmates(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.course_students cs_a
    join public.course_students cs_b on cs_a.course_id = cs_b.course_id
    where cs_a.student_id = user_a
      and cs_b.student_id = user_b
  );
$$;

create or replace function public.is_course_active(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.courses c
    where c.id = target_course_id
      and c.is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text = 'admin'
  );
$$;

revoke all on function public.is_teacher_user(uuid) from public;
grant execute on function public.is_teacher_user(uuid) to authenticated;

revoke all on function public.is_teacher_of_course(uuid) from public;
grant execute on function public.is_teacher_of_course(uuid) to authenticated;

revoke all on function public.is_student_enrolled(uuid, uuid) from public;
grant execute on function public.is_student_enrolled(uuid, uuid) to authenticated;

revoke all on function public.is_teacher_of_student(uuid) from public;
grant execute on function public.is_teacher_of_student(uuid) to authenticated;

revoke all on function public.are_classmates(uuid, uuid) from public;
grant execute on function public.are_classmates(uuid, uuid) to authenticated;

revoke all on function public.is_course_active(uuid) from public;
grant execute on function public.is_course_active(uuid) to authenticated;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Drop all policies on core tables (safe re-run of policy section)
-- ---------------------------------------------------------------------------

do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'courses', 'course_students', 'hand_raises')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- profiles policies
-- ---------------------------------------------------------------------------

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_select_classmates"
  on public.profiles
  for select
  to authenticated
  using (public.are_classmates(auth.uid(), profiles.id));

create policy "profiles_select_teacher_students"
  on public.profiles
  for select
  to authenticated
  using (public.is_teacher_of_student(profiles.id));

create policy "profiles_insert_self"
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update_self"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- courses policies
-- ---------------------------------------------------------------------------

create policy "courses_select_teacher"
  on public.courses
  for select
  to authenticated
  using (teacher_id = auth.uid());

create policy "courses_select_enrolled_student"
  on public.courses
  for select
  to authenticated
  using (public.is_student_enrolled(courses.id, auth.uid()));

create policy "courses_insert_teacher"
  on public.courses
  for insert
  to authenticated
  with check (
    teacher_id = auth.uid()
    and public.is_teacher_user(auth.uid())
  );

create policy "courses_update_teacher"
  on public.courses
  for update
  to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- ---------------------------------------------------------------------------
-- course_students policies
-- ---------------------------------------------------------------------------

create policy "course_students_select_self"
  on public.course_students
  for select
  to authenticated
  using (student_id = auth.uid());

create policy "course_students_select_teacher"
  on public.course_students
  for select
  to authenticated
  using (public.is_teacher_of_course(course_id));

create policy "course_students_insert_teacher"
  on public.course_students
  for insert
  to authenticated
  with check (public.is_teacher_of_course(course_id));

create policy "course_students_update_teacher"
  on public.course_students
  for update
  to authenticated
  using (public.is_teacher_of_course(course_id))
  with check (public.is_teacher_of_course(course_id));

create policy "course_students_delete_teacher"
  on public.course_students
  for delete
  to authenticated
  using (public.is_teacher_of_course(course_id));

-- ---------------------------------------------------------------------------
-- hand_raises policies
-- ---------------------------------------------------------------------------

create policy "hand_raises_select_enrolled"
  on public.hand_raises
  for select
  to authenticated
  using (public.is_student_enrolled(hand_raises.course_id, auth.uid()));

create policy "hand_raises_select_teacher"
  on public.hand_raises
  for select
  to authenticated
  using (public.is_teacher_of_course(course_id));

create policy "hand_raises_insert_active_enrolled"
  on public.hand_raises
  for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and public.is_student_enrolled(course_id, auth.uid())
    and public.is_course_active(course_id)
  );

create policy "hand_raises_delete_own"
  on public.hand_raises
  for delete
  to authenticated
  using (student_id = auth.uid());

create policy "hand_raises_delete_teacher"
  on public.hand_raises
  for delete
  to authenticated
  using (public.is_teacher_of_course(course_id));

-- ---------------------------------------------------------------------------
-- Student self-enroll + browse courses
-- ---------------------------------------------------------------------------

create policy "courses_select_student_browse"
  on public.courses
  for select
  to authenticated
  using (not public.is_teacher_user(auth.uid()));

create policy "course_students_insert_self"
  on public.course_students
  for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and not public.is_teacher_user(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Admin policies
-- ---------------------------------------------------------------------------

create policy "profiles_select_admin"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

create policy "profiles_insert_admin"
  on public.profiles
  for insert
  to authenticated
  with check (public.is_admin());

create policy "profiles_update_admin"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "profiles_delete_admin"
  on public.profiles
  for delete
  to authenticated
  using (public.is_admin());

create policy "courses_select_admin"
  on public.courses
  for select
  to authenticated
  using (public.is_admin());

create policy "courses_insert_admin"
  on public.courses
  for insert
  to authenticated
  with check (public.is_admin());

create policy "courses_update_admin"
  on public.courses
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "courses_delete_admin"
  on public.courses
  for delete
  to authenticated
  using (public.is_admin());

create policy "course_students_select_admin"
  on public.course_students
  for select
  to authenticated
  using (public.is_admin());

create policy "course_students_insert_admin"
  on public.course_students
  for insert
  to authenticated
  with check (public.is_admin());

create policy "course_students_update_admin"
  on public.course_students
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "course_students_delete_admin"
  on public.course_students
  for delete
  to authenticated
  using (public.is_admin());

create policy "hand_raises_select_admin"
  on public.hand_raises
  for select
  to authenticated
  using (public.is_admin());

create policy "hand_raises_insert_admin"
  on public.hand_raises
  for insert
  to authenticated
  with check (public.is_admin());

create policy "hand_raises_update_admin"
  on public.hand_raises
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "hand_raises_delete_admin"
  on public.hand_raises
  for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Realtime (hand_raises)
-- ---------------------------------------------------------------------------

do $realtime$
begin
  alter publication supabase_realtime add table public.hand_raises;
exception
  when duplicate_object then
    null;
  when others then
    if sqlerrm ilike '%already%a member%' then
      null;
    else
      raise;
    end if;
end
$realtime$;

-- ---------------------------------------------------------------------------
-- PostgREST schema cache
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';

-- Example after creating a user in Authentication (replace UUID and student_id):
-- insert into public.profiles (id, name, role, must_change_password, student_id)
-- values ('00000000-0000-0000-0000-000000000000', 'Admin', 'admin', false, 'admin001');

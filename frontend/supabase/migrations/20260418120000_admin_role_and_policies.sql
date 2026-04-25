-- Admin role + non-recursive helper is_admin() + full CRUD policies for admins.
--
-- Supports both:
-- - profiles.role as text + CHECK constraint (local migrations in this repo), and
-- - profiles.role as enum public.app_role (e.g. Supabase dashboard / other tooling).
--
-- Note: compare role via ::text so we do not reference the enum label 'admin' before it exists.

-- ---------------------------------------------------------------------------
-- 1) Helper: current user is admin (SECURITY DEFINER, RLS off)
-- ---------------------------------------------------------------------------
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

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Allow admin in profiles.role (enum label or text check)
-- ---------------------------------------------------------------------------
do $$
declare
  role_udt name;
begin
  select c.udt_name
    into role_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'profiles'
    and c.column_name = 'role';

  if role_udt = 'app_role' then
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on e.enumtypid = t.oid
      join pg_namespace n on t.typnamespace = n.oid
      where n.nspname = 'public'
        and t.typname = 'app_role'
        and e.enumlabel = 'admin'
    ) then
      alter type public.app_role add value 'admin';
    end if;
  elsif role_udt = 'text' then
    alter table public.profiles drop constraint if exists profiles_role_check;
    alter table public.profiles add constraint profiles_role_check
      check (role in ('teacher', 'student', 'admin'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Admin policies (OR-combined with existing policies)
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_insert_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;
drop policy if exists "courses_select_admin" on public.courses;
drop policy if exists "courses_insert_admin" on public.courses;
drop policy if exists "courses_update_admin" on public.courses;
drop policy if exists "courses_delete_admin" on public.courses;
drop policy if exists "course_students_select_admin" on public.course_students;
drop policy if exists "course_students_insert_admin" on public.course_students;
drop policy if exists "course_students_update_admin" on public.course_students;
drop policy if exists "course_students_delete_admin" on public.course_students;
drop policy if exists "hand_raises_select_admin" on public.hand_raises;
drop policy if exists "hand_raises_insert_admin" on public.hand_raises;
drop policy if exists "hand_raises_update_admin" on public.hand_raises;
drop policy if exists "hand_raises_delete_admin" on public.hand_raises;

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

notify pgrst, 'reload schema';

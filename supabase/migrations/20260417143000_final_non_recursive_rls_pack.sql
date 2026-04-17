-- Final non-recursive RLS pack for Agile FJU Handup.
-- This migration rebuilds policies for:
-- - profiles
-- - courses
-- - course_students
-- - hand_raises
-- and routes cross-table checks through SECURITY DEFINER helpers.

-- ---------------------------------------------------------------------------
-- 0) Ensure RLS is enabled
-- ---------------------------------------------------------------------------
alter table if exists public.profiles enable row level security;
alter table if exists public.courses enable row level security;
alter table if exists public.course_students enable row level security;
alter table if exists public.hand_raises enable row level security;

-- ---------------------------------------------------------------------------
-- 1) Helper functions (non-recursive policy checks)
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

-- ---------------------------------------------------------------------------
-- 2) Drop existing policies on core tables
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
-- 3) profiles policies
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
-- 4) courses policies
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
-- 5) course_students policies
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
-- 6) hand_raises policies
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
-- 7) Reload PostgREST schema cache
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

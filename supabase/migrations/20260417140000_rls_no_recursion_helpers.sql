-- Hard-fix RLS recursion by routing cross-table checks through
-- SECURITY DEFINER helper functions with row_security=off.

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

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

revoke all on function public.is_teacher_of_course(uuid) from public;
grant execute on function public.is_teacher_of_course(uuid) to authenticated;

revoke all on function public.is_student_enrolled(uuid, uuid) from public;
grant execute on function public.is_student_enrolled(uuid, uuid) to authenticated;

revoke all on function public.is_teacher_of_student(uuid) from public;
grant execute on function public.is_teacher_of_student(uuid) to authenticated;

revoke all on function public.are_classmates(uuid, uuid) from public;
grant execute on function public.are_classmates(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- profiles policies (avoid recursive joins through policy-evaluated tables)
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_select_classmates" on public.profiles;
create policy "profiles_select_classmates"
  on public.profiles for select to authenticated
  using (public.are_classmates(auth.uid(), profiles.id));

drop policy if exists "profiles_select_teacher_students" on public.profiles;
create policy "profiles_select_teacher_students"
  on public.profiles for select to authenticated
  using (public.is_teacher_of_student(profiles.id));

-- ---------------------------------------------------------------------------
-- course_students policies
-- ---------------------------------------------------------------------------

drop policy if exists "course_students_select_teacher" on public.course_students;
create policy "course_students_select_teacher"
  on public.course_students for select to authenticated
  using (public.is_teacher_of_course(course_id));

drop policy if exists "course_students_insert_teacher" on public.course_students;
create policy "course_students_insert_teacher"
  on public.course_students for insert to authenticated
  with check (public.is_teacher_of_course(course_id));

drop policy if exists "course_students_update_teacher" on public.course_students;
create policy "course_students_update_teacher"
  on public.course_students for update to authenticated
  using (public.is_teacher_of_course(course_id))
  with check (public.is_teacher_of_course(course_id));

drop policy if exists "course_students_delete_teacher" on public.course_students;
create policy "course_students_delete_teacher"
  on public.course_students for delete to authenticated
  using (public.is_teacher_of_course(course_id));

-- ---------------------------------------------------------------------------
-- courses policies
-- ---------------------------------------------------------------------------

drop policy if exists "courses_select_enrolled_student" on public.courses;
create policy "courses_select_enrolled_student"
  on public.courses for select to authenticated
  using (public.is_student_enrolled(courses.id, auth.uid()));

-- ---------------------------------------------------------------------------
-- hand_raises policies
-- ---------------------------------------------------------------------------

drop policy if exists "hand_raises_select_enrolled" on public.hand_raises;
create policy "hand_raises_select_enrolled"
  on public.hand_raises for select to authenticated
  using (public.is_student_enrolled(hand_raises.course_id, auth.uid()));

drop policy if exists "hand_raises_select_teacher" on public.hand_raises;
create policy "hand_raises_select_teacher"
  on public.hand_raises for select to authenticated
  using (public.is_teacher_of_course(course_id));

drop policy if exists "hand_raises_insert_active_enrolled" on public.hand_raises;
create policy "hand_raises_insert_active_enrolled"
  on public.hand_raises for insert to authenticated
  with check (
    student_id = auth.uid()
    and public.is_student_enrolled(course_id, auth.uid())
    and exists (
      select 1
      from public.courses c
      where c.id = course_id
        and c.is_active = true
    )
  );

drop policy if exists "hand_raises_delete_teacher" on public.hand_raises;
create policy "hand_raises_delete_teacher"
  on public.hand_raises for delete to authenticated
  using (public.is_teacher_of_course(course_id));

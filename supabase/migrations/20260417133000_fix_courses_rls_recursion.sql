-- Fix RLS infinite recursion between courses and course_students.
-- Error seen: 42P17 infinite recursion detected in policy for relation "courses"

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

revoke all on function public.is_teacher_of_course(uuid) from public;
grant execute on function public.is_teacher_of_course(uuid) to authenticated;

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

drop policy if exists "profiles_select_teacher_students" on public.profiles;
create policy "profiles_select_teacher_students"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.course_students cs
      where
        cs.student_id = profiles.id
        and public.is_teacher_of_course(cs.course_id)
    )
  );

drop policy if exists "hand_raises_select_teacher" on public.hand_raises;
create policy "hand_raises_select_teacher"
  on public.hand_raises for select to authenticated
  using (public.is_teacher_of_course(course_id));

drop policy if exists "hand_raises_delete_teacher" on public.hand_raises;
create policy "hand_raises_delete_teacher"
  on public.hand_raises for delete to authenticated
  using (public.is_teacher_of_course(course_id));

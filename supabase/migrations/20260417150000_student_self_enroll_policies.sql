-- Allow students to browse courses and self-enroll safely.
-- Depends on helper function public.is_teacher_user(uuid).

drop policy if exists "courses_select_student_browse" on public.courses;
create policy "courses_select_student_browse"
  on public.courses
  for select
  to authenticated
  using (not public.is_teacher_user(auth.uid()));

drop policy if exists "course_students_insert_self" on public.course_students;
create policy "course_students_insert_self"
  on public.course_students
  for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and not public.is_teacher_user(auth.uid())
  );

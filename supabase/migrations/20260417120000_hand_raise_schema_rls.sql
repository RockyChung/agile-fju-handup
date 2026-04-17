-- Agile FJU Handup: schema + RLS policies for Supabase (PostgreSQL).
-- Matches the Next.js client: login, teacher courses + student signup, hand-raise queue ordered by created_at ASC.
--
-- Before you run:
-- 1) Teacher dashboard uses a second anon client for auth.signUp; profile upsert runs as the NEW student's JWT.
--    Turn off email confirmation for those signups, or ensure signUp returns a session; otherwise RLS blocks profiles upsert.
-- 2) Create the first teacher in Supabase Auth, then insert public.profiles (role = teacher) for that user id, or use a trigger.
-- 3) Realtime block adds hand_raises to publication supabase_realtime; safe to re-run (duplicate is ignored).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  role text not null check (role in ('teacher', 'student')),
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
-- Helper function for RLS (prevents policy recursion)
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

revoke all on function public.is_teacher_of_course(uuid) from public;
grant execute on function public.is_teacher_of_course(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_students enable row level security;
alter table public.hand_raises enable row level security;

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_select_classmates" on public.profiles;
create policy "profiles_select_classmates"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.course_students cs_self
      join public.course_students cs_other on cs_self.course_id = cs_other.course_id
      where
        cs_self.student_id = auth.uid()
        and cs_other.student_id = profiles.id
    )
  );

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

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- courses
drop policy if exists "courses_select_teacher" on public.courses;
create policy "courses_select_teacher"
  on public.courses for select to authenticated
  using (teacher_id = auth.uid());

drop policy if exists "courses_select_enrolled_student" on public.courses;
create policy "courses_select_enrolled_student"
  on public.courses for select to authenticated
  using (
    exists (
      select 1
      from public.course_students cs
      where
        cs.course_id = courses.id
        and cs.student_id = auth.uid()
    )
  );

drop policy if exists "courses_insert_teacher" on public.courses;
create policy "courses_insert_teacher"
  on public.courses for insert to authenticated
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where
        p.id = auth.uid()
        and p.role = 'teacher'
    )
  );

drop policy if exists "courses_update_teacher" on public.courses;
create policy "courses_update_teacher"
  on public.courses for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- course_students
drop policy if exists "course_students_select_self" on public.course_students;
create policy "course_students_select_self"
  on public.course_students for select to authenticated
  using (student_id = auth.uid());

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

-- hand_raises
drop policy if exists "hand_raises_select_enrolled" on public.hand_raises;
create policy "hand_raises_select_enrolled"
  on public.hand_raises for select to authenticated
  using (
    exists (
      select 1
      from public.course_students cs
      where
        cs.course_id = hand_raises.course_id
        and cs.student_id = auth.uid()
    )
  );

drop policy if exists "hand_raises_select_teacher" on public.hand_raises;
create policy "hand_raises_select_teacher"
  on public.hand_raises for select to authenticated
  using (public.is_teacher_of_course(course_id));

drop policy if exists "hand_raises_insert_active_enrolled" on public.hand_raises;
create policy "hand_raises_insert_active_enrolled"
  on public.hand_raises for insert to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1
      from public.course_students cs
      where
        cs.course_id = course_id
        and cs.student_id = auth.uid()
    )
    and exists (
      select 1
      from public.courses c
      where
        c.id = course_id
        and c.is_active = true
    )
  );

drop policy if exists "hand_raises_delete_own" on public.hand_raises;
create policy "hand_raises_delete_own"
  on public.hand_raises for delete to authenticated
  using (student_id = auth.uid());

drop policy if exists "hand_raises_delete_teacher" on public.hand_raises;
create policy "hand_raises_delete_teacher"
  on public.hand_raises for delete to authenticated
  using (public.is_teacher_of_course(course_id));

-- ---------------------------------------------------------------------------
-- Realtime (live queue for student + teacher UIs)
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
-- Bootstrap (run once in SQL Editor; use the teacher user id from Auth > Users)
-- ---------------------------------------------------------------------------
-- insert into public.profiles (id, name, role, must_change_password)
-- values ('00000000-0000-0000-0000-000000000000', 'Instructor', 'teacher', false);

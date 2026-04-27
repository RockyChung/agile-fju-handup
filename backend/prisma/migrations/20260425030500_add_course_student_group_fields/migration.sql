ALTER TABLE "course_students"
ADD COLUMN "group_name" TEXT,
ADD COLUMN "is_leader" BOOLEAN NOT NULL DEFAULT false;

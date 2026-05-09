CREATE TABLE "course_scores" (
  "id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "score" INTEGER NOT NULL,
  "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "course_scores_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_course_scores_course_day" ON "course_scores"("course_id", "awarded_at");
CREATE INDEX "idx_course_scores_course_student_day" ON "course_scores"("course_id", "student_id", "awarded_at");

ALTER TABLE "course_scores"
ADD CONSTRAINT "course_scores_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "course_scores"
ADD CONSTRAINT "course_scores_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

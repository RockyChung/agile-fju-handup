-- CreateTable
CREATE TABLE "course_group_scores" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "round_id" UUID,
    "group_key" TEXT NOT NULL,
    "group_display_name" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_group_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_group_scores_round_id_key" ON "course_group_scores"("round_id");

-- CreateIndex
CREATE INDEX "idx_course_group_scores_course_day" ON "course_group_scores"("course_id", "awarded_at");

-- CreateIndex
CREATE INDEX "idx_course_group_scores_course_group" ON "course_group_scores"("course_id", "group_key");

-- AddForeignKey
ALTER TABLE "course_group_scores" ADD CONSTRAINT "course_group_scores_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_group_scores" ADD CONSTRAINT "course_group_scores_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "course_group_score_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

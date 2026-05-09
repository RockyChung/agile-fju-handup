-- CreateEnum
CREATE TYPE "GroupScoreRoundStatus" AS ENUM ('open', 'finalized', 'cancelled');

-- CreateTable
CREATE TABLE "course_group_score_rounds" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "speaker_student_id" UUID NOT NULL,
    "teacher_score" INTEGER,
    "status" "GroupScoreRoundStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMP(3),

    CONSTRAINT "course_group_score_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_group_score_leader_votes" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "leader_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_group_score_leader_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_group_score_rounds_course_status" ON "course_group_score_rounds"("course_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "group_score_leader_vote_round_leader_key" ON "course_group_score_leader_votes"("round_id", "leader_id");

-- AddForeignKey
ALTER TABLE "course_group_score_rounds" ADD CONSTRAINT "course_group_score_rounds_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_group_score_rounds" ADD CONSTRAINT "course_group_score_rounds_speaker_student_id_fkey" FOREIGN KEY ("speaker_student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_group_score_leader_votes" ADD CONSTRAINT "course_group_score_leader_votes_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "course_group_score_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_group_score_leader_votes" ADD CONSTRAINT "course_group_score_leader_votes_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

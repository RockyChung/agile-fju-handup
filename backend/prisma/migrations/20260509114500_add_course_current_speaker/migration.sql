ALTER TABLE "courses"
ADD COLUMN "current_speaker_id" UUID;

CREATE INDEX "idx_courses_current_speaker" ON "courses"("current_speaker_id");

ALTER TABLE "courses"
ADD CONSTRAINT "courses_current_speaker_id_fkey"
FOREIGN KEY ("current_speaker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

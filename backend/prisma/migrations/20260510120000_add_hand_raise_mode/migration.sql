-- CreateEnum
CREATE TYPE "HandRaiseMode" AS ENUM ('individual', 'group');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN "hand_raise_mode" "HandRaiseMode" NOT NULL DEFAULT 'individual';

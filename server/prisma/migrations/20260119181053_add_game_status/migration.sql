-- CreateEnum
CREATE TYPE "public"."GameStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "public"."Game" ADD COLUMN     "status" "public"."GameStatus" NOT NULL DEFAULT 'OPEN';

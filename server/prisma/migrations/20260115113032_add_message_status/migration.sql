-- CreateEnum
CREATE TYPE "public"."MessageStatus" AS ENUM ('sent', 'delivered', 'read');

-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "status" "public"."MessageStatus" NOT NULL DEFAULT 'sent';

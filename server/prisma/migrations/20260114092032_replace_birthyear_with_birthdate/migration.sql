-- AlterTable: User

ALTER TABLE "public"."User" DROP COLUMN IF EXISTS "age";
ALTER TABLE "public"."User" DROP COLUMN IF EXISTS "birthYear";

ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3);
-- DropForeignKey
ALTER TABLE "public"."GameRole" DROP CONSTRAINT "GameRole_gameId_fkey";

-- DropForeignKey
ALTER TABLE "public"."GameRole" DROP CONSTRAINT "GameRole_userId_fkey";

-- AlterTable
ALTER TABLE "public"."GameRole" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "public"."GameRole" ADD CONSTRAINT "GameRole_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GameRole" ADD CONSTRAINT "GameRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

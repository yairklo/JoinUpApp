-- CreateEnum
CREATE TYPE "public"."JoinPolicy" AS ENUM ('INSTANT', 'REQUIRES_APPROVAL');

-- AlterEnum: ParticipationStatus gains PENDING / REJECTED for the join-approval workflow.
-- Existing rows are untouched: CONFIRMED already represents "approved", so no data backfill is needed.
ALTER TYPE "public"."ParticipationStatus" ADD VALUE 'PENDING';
ALTER TYPE "public"."ParticipationStatus" ADD VALUE 'REJECTED';

-- AlterEnum: restores values referenced by server code from the prior notification-system work,
-- plus new values for the join-approval decision notifications.
ALTER TYPE "public"."NotificationType" ADD VALUE 'NEW_GAME_IN_CITY';
ALTER TYPE "public"."NotificationType" ADD VALUE 'GAME_JOIN_REQUEST';
ALTER TYPE "public"."NotificationType" ADD VALUE 'GAME_JOIN_APPROVED';
ALTER TYPE "public"."NotificationType" ADD VALUE 'GAME_JOIN_REJECTED';

-- AlterTable
ALTER TABLE "public"."Game" ADD COLUMN     "joinPolicy" "public"."JoinPolicy" NOT NULL DEFAULT 'INSTANT';

-- AlterTable: restores expoPushToken support and makes fcmToken optional so a device
-- can be registered with either an Expo token or an FCM token.
DROP INDEX "public"."UserDevice_fcmToken_key";
ALTER TABLE "public"."UserDevice" ALTER COLUMN "fcmToken" DROP NOT NULL,
ADD COLUMN     "expoPushToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_fcmToken_key" ON "public"."UserDevice"("fcmToken");

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_expoPushToken_key" ON "public"."UserDevice"("expoPushToken");

-- CreateIndex
CREATE INDEX "UserDevice_expoPushToken_idx" ON "public"."UserDevice"("expoPushToken");

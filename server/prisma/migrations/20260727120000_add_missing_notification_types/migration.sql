-- Notification types used by roster / waitlist / role flows were declared in
-- schema.prisma but never added to the Postgres enum. Inserts with these values
-- failed silently (caught + logged), so managers could add friends to a game
-- without any in-app or push notification reaching them.
ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'GAME_WAITLIST_OFFER';
ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'GAME_INVITATION';
ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'GAME_REMOVED_PEER';
ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'GAME_ROLE_UPDATE';

-- Additive: preferred push language per device (NULL = Hebrew).
ALTER TABLE "public"."UserDevice" ADD COLUMN "locale" TEXT;

-- Groups created before the "creator is a member" fix have no SeriesParticipant row for their
-- organizer, so the organizer is missing from the member list. Backfill them as MANAGER (the same
-- role createGame / convertGameToSeries now assign). Existing rows are left untouched.
INSERT INTO "SeriesParticipant" ("id", "seriesId", "userId", "role")
SELECT gen_random_uuid()::text, gs."id", gs."organizerId", 'MANAGER'::"SeriesRoleType"
FROM "GameSeries" gs
ON CONFLICT ("seriesId", "userId") DO NOTHING;

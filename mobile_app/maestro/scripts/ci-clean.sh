#!/usr/bin/env bash
# CI replacement for the docker-compose game cleanup in run.mjs (E2E_CLEAN_CMD).
exec psql "${E2E_PSQL_URL:-postgresql://joinup:joinup@localhost:5432/joinup_e2e}" -c 'TRUNCATE TABLE "Game" CASCADE'

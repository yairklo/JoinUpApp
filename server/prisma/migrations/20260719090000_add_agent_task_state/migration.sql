-- CreateTable: durable FSM TaskState snapshots for the Multi-Agent Management System
-- (see server/agent-system/fsmEngine.ts). The full TaskState object is upserted here
-- as `state` on every transition; `version` guards optimistic-concurrency writes.
CREATE TABLE "public"."AgentTaskState" (
    "taskId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "parentTaskId" TEXT,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTaskState_pkey" PRIMARY KEY ("taskId")
);

-- CreateIndex
CREATE INDEX "AgentTaskState_sessionId_idx" ON "public"."AgentTaskState"("sessionId");

-- CreateIndex
CREATE INDEX "AgentTaskState_status_idx" ON "public"."AgentTaskState"("status");

-- CreateIndex
CREATE INDEX "AgentTaskState_parentTaskId_idx" ON "public"."AgentTaskState"("parentTaskId");

-- CreateTable: real-time, atomically-incremented fiscal spend tracker keyed
-- by costScopeId (see server/agent-system/fsmEngine.ts's FiscalBudgetLedger).
CREATE TABLE "public"."AgentCostLedger" (
    "costScopeId" TEXT NOT NULL,
    "spentUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCostLedger_pkey" PRIMARY KEY ("costScopeId")
);

-- CreateTable: append-only per-turn token usage audit trail, shaped after
-- OpenTelemetry GenAI semantic conventions for a future OTel/Phoenix exporter.
CREATE TABLE "public"."AgentExecutionLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentExecutionLog_taskId_idx" ON "public"."AgentExecutionLog"("taskId");

-- CreateIndex
CREATE INDEX "AgentExecutionLog_createdAt_idx" ON "public"."AgentExecutionLog"("createdAt");

-- CreateEnum
CREATE TYPE "FieldIssueCategory" AS ENUM ('POTHOLE', 'LIGHTING', 'SURFACE', 'GOAL_NET', 'FENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "FieldIssueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "FieldComment" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldIssueReport" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "FieldIssueCategory" NOT NULL,
    "description" TEXT,
    "status" "FieldIssueStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "FieldIssueReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldComment_fieldId_createdAt_idx" ON "FieldComment"("fieldId", "createdAt");

-- CreateIndex
CREATE INDEX "FieldIssueReport_fieldId_status_idx" ON "FieldIssueReport"("fieldId", "status");

-- CreateIndex
CREATE INDEX "FieldIssueReport_fieldId_createdAt_idx" ON "FieldIssueReport"("fieldId", "createdAt");

-- AddForeignKey
ALTER TABLE "FieldComment" ADD CONSTRAINT "FieldComment_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldComment" ADD CONSTRAINT "FieldComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldIssueReport" ADD CONSTRAINT "FieldIssueReport_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldIssueReport" ADD CONSTRAINT "FieldIssueReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

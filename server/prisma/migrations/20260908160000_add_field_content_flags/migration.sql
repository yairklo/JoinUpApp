-- CreateEnum
CREATE TYPE "FieldFlagReason" AS ENUM ('OFFENSIVE', 'FALSE_INFO', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "FieldFlagStatus" AS ENUM ('PENDING', 'DISMISSED');

-- AlterTable
ALTER TABLE "FieldComment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FieldIssueReport" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "FieldCommentFlag" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "FieldFlagReason" NOT NULL,
    "details" TEXT,
    "status" "FieldFlagStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldCommentFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldIssueReportFlag" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "FieldFlagReason" NOT NULL,
    "details" TEXT,
    "status" "FieldFlagStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldIssueReportFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldCommentFlag_status_idx" ON "FieldCommentFlag"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FieldCommentFlag_commentId_reporterId_key" ON "FieldCommentFlag"("commentId", "reporterId");

-- CreateIndex
CREATE INDEX "FieldIssueReportFlag_status_idx" ON "FieldIssueReportFlag"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FieldIssueReportFlag_issueId_reporterId_key" ON "FieldIssueReportFlag"("issueId", "reporterId");

-- AddForeignKey
ALTER TABLE "FieldCommentFlag" ADD CONSTRAINT "FieldCommentFlag_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FieldComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldCommentFlag" ADD CONSTRAINT "FieldCommentFlag_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldIssueReportFlag" ADD CONSTRAINT "FieldIssueReportFlag_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "FieldIssueReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldIssueReportFlag" ADD CONSTRAINT "FieldIssueReportFlag_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

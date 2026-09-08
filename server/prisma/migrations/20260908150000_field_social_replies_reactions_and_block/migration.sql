-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('LIKE', 'DISLIKE');

-- AlterTable
ALTER TABLE "FieldComment" ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "FieldIssueReport" ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "category" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blockedFromFieldSocial" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FieldCommentReaction" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldCommentReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldIssueReportReaction" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldIssueReportReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FieldCommentReaction_commentId_userId_key" ON "FieldCommentReaction"("commentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldIssueReportReaction_issueId_userId_key" ON "FieldIssueReportReaction"("issueId", "userId");

-- CreateIndex
CREATE INDEX "FieldComment_parentId_idx" ON "FieldComment"("parentId");

-- CreateIndex
CREATE INDEX "FieldIssueReport_parentId_idx" ON "FieldIssueReport"("parentId");

-- AddForeignKey
ALTER TABLE "FieldComment" ADD CONSTRAINT "FieldComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FieldComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldCommentReaction" ADD CONSTRAINT "FieldCommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FieldComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldCommentReaction" ADD CONSTRAINT "FieldCommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldIssueReport" ADD CONSTRAINT "FieldIssueReport_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FieldIssueReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldIssueReportReaction" ADD CONSTRAINT "FieldIssueReportReaction_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "FieldIssueReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldIssueReportReaction" ADD CONSTRAINT "FieldIssueReportReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

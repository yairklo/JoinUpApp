-- CreateEnum
CREATE TYPE "FieldSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "FieldSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "isPaid" BOOLEAN,
    "contactInfo" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "sport" TEXT,
    "status" "FieldSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "createdFieldId" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "FieldSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldSuggestion_status_createdAt_idx" ON "FieldSuggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FieldSuggestion_userId_createdAt_idx" ON "FieldSuggestion"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "FieldSuggestion" ADD CONSTRAINT "FieldSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


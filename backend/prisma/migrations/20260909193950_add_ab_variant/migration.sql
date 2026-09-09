-- AlterTable
ALTER TABLE "User" ADD COLUMN     "abAssignedAt" TIMESTAMP(3),
ADD COLUMN     "abVariant" TEXT;

-- CreateIndex
CREATE INDEX "User_abVariant_idx" ON "User"("abVariant");

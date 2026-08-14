-- CreateEnum
CREATE TYPE "ValidationJobStatus" AS ENUM ('NOT_STARTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT');

-- AlterTable
ALTER TABLE "extraction_jobs" ADD COLUMN     "validationCompletedAt" TIMESTAMP(3),
ADD COLUMN     "validationErrorMessage" TEXT,
ADD COLUMN     "validationExternalJobId" TEXT,
ADD COLUMN     "validationRawResponse" JSONB,
ADD COLUMN     "validationReportMarkdown" TEXT,
ADD COLUMN     "validationStartedAt" TIMESTAMP(3),
ADD COLUMN     "validationStatus" "ValidationJobStatus" NOT NULL DEFAULT 'NOT_STARTED';

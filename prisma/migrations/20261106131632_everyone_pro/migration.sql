-- AlterTable
ALTER TABLE "shops" ALTER COLUMN "plan" SET DEFAULT 'PRO';

-- Every shop is PRO until subscription billing (P2.11) exists: nobody loses a feature they use.
UPDATE "shops" SET "plan" = 'PRO' WHERE "plan" = 'FREE';

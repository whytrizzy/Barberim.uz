-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "deposit_amount" INTEGER,
ADD COLUMN     "people_count" INTEGER;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "book_ahead_days" INTEGER,
ADD COLUMN     "deposit_amount" INTEGER,
ADD COLUMN     "max_people" INTEGER;

-- Bounds Prisma can't express (same as the request schemas).
ALTER TABLE "services"
  ADD CONSTRAINT "services_package_values" CHECK (
    ("max_people" IS NULL OR "max_people" BETWEEN 1 AND 50)
    AND ("book_ahead_days" IS NULL OR "book_ahead_days" BETWEEN 1 AND 365)
    AND ("deposit_amount" IS NULL OR ("deposit_amount" > 0 AND "deposit_amount" <= "price"))
  );

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_package_values" CHECK (
    ("people_count" IS NULL OR "people_count" BETWEEN 1 AND 50)
    AND ("deposit_amount" IS NULL OR "deposit_amount" > 0)
  );

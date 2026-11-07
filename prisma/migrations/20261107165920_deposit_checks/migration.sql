-- Bounds Prisma can't express: a deposit is a positive amount; an Uzum payment code has 6 digits.
ALTER TABLE "deposits"
  ADD CONSTRAINT "deposits_values" CHECK (
    "amount" > 0 AND ("code" IS NULL OR "code" BETWEEN 100000 AND 999999)
  );

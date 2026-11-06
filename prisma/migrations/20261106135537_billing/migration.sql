-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAYME', 'CLICK');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "plan_until" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "user_id" UUID,
    "provider" "PaymentProvider" NOT NULL,
    "amount" INTEGER NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 30,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider_trans_id" TEXT,
    "provider_state" INTEGER,
    "provider_time" BIGINT,
    "perform_time" BIGINT,
    "cancel_time" BIGINT,
    "cancel_reason" INTEGER,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_shop_id_created_at_idx" ON "payments"("shop_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_trans_id_key" ON "payments"("provider", "provider_trans_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

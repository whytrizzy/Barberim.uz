-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('AWAITING', 'PAID', 'CANCELLED', 'REFUND_DUE', 'REFUNDED', 'KEPT');

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "requires_deposit" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "shop_payment_accounts" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "account_id" TEXT NOT NULL,
    "login" TEXT,
    "secret_cipher" TEXT NOT NULL,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shop_payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'AWAITING',
    "provider" "PaymentProvider",
    "code" INTEGER,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "provider_trans_id" TEXT,
    "provider_state" INTEGER,
    "provider_time" BIGINT,
    "perform_time" BIGINT,
    "cancel_time" BIGINT,
    "cancel_reason" INTEGER,
    "paid_at" TIMESTAMPTZ(3),
    "refunded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_payment_accounts_shop_id_provider_key" ON "shop_payment_accounts"("shop_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_booking_id_key" ON "deposits"("booking_id");

-- CreateIndex
CREATE INDEX "deposits_status_expires_at_idx" ON "deposits"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_provider_provider_trans_id_key" ON "deposits"("provider", "provider_trans_id");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_shop_id_code_key" ON "deposits"("shop_id", "code");

-- AddForeignKey
ALTER TABLE "shop_payment_accounts" ADD CONSTRAINT "shop_payment_accounts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

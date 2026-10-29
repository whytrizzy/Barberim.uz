-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('uz_Latn', 'uz_Cyrl', 'ru');

-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'ADMIN', 'MASTER');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('ADULT', 'KIDS', 'BEARD', 'WEDDING', 'OTHER');

-- CreateEnum
CREATE TYPE "OverrideType" AS ENUM ('DAY_OFF', 'CUSTOM_HOURS');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED_CLIENT', 'CANCELLED_SHOP');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('APP', 'WALK_IN', 'PHONE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('TELEGRAM', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "username" TEXT,
    "phone" TEXT,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "locale" "Locale" NOT NULL DEFAULT 'uz_Latn',
    "photo_url" TEXT,
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "about" TEXT,
    "address" TEXT NOT NULL,
    "landmark" TEXT,
    "district" TEXT,
    "region" TEXT NOT NULL DEFAULT 'Toshkent',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ShopStatus" NOT NULL DEFAULT 'DRAFT',
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "user_id" UUID,
    "display_name" TEXT NOT NULL,
    "photo_url" TEXT,
    "bio" TEXT,
    "role" "StaffRole" NOT NULL DEFAULT 'MASTER',
    "is_bookable" BOOLEAN NOT NULL DEFAULT true,
    "commission_pct" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_invites" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL DEFAULT 'ADULT',
    "duration_min" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "price_is_from" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_services" (
    "staff_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "price_override" INTEGER,
    "duration_override" INTEGER,

    CONSTRAINT "staff_services_pkey" PRIMARY KEY ("staff_id","service_id")
);

-- CreateTable
CREATE TABLE "weekly_hours" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_min" INTEGER NOT NULL,
    "end_min" INTEGER NOT NULL,

    CONSTRAINT "weekly_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_overrides" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "OverrideType" NOT NULL,
    "start_min" INTEGER,
    "end_min" INTEGER,
    "reason" TEXT,

    CONSTRAINT "schedule_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_clients" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "visit_count" INTEGER NOT NULL DEFAULT 0,
    "no_show_count" INTEGER NOT NULL DEFAULT 0,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shop_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "shop_client_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "BookingSource" NOT NULL DEFAULT 'APP',
    "group_id" UUID,
    "total_price" INTEGER NOT NULL,
    "note" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_items" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "service_id" UUID,
    "name_snapshot" TEXT NOT NULL,
    "price_snapshot" INTEGER NOT NULL,
    "duration_snapshot" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "booking_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'TELEGRAM',
    "chat_id" BIGINT,
    "phone" TEXT,
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "send_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "booking_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "shop_id" UUID,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "data" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "shops_slug_key" ON "shops"("slug");

-- CreateIndex
CREATE INDEX "shops_status_district_idx" ON "shops"("status", "district");

-- CreateIndex
CREATE INDEX "staff_shop_id_is_active_idx" ON "staff"("shop_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "staff_shop_id_user_id_key" ON "staff"("shop_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invites_token_hash_key" ON "staff_invites"("token_hash");

-- CreateIndex
CREATE INDEX "services_shop_id_is_active_idx" ON "services"("shop_id", "is_active");

-- CreateIndex
CREATE INDEX "weekly_hours_staff_id_weekday_idx" ON "weekly_hours"("staff_id", "weekday");

-- CreateIndex
CREATE INDEX "schedule_overrides_staff_id_date_idx" ON "schedule_overrides"("staff_id", "date");

-- CreateIndex
CREATE INDEX "shop_clients_shop_id_phone_idx" ON "shop_clients"("shop_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "shop_clients_shop_id_user_id_key" ON "shop_clients"("shop_id", "user_id");

-- CreateIndex
CREATE INDEX "bookings_staff_id_start_at_idx" ON "bookings"("staff_id", "start_at");

-- CreateIndex
CREATE INDEX "bookings_shop_id_start_at_idx" ON "bookings"("shop_id", "start_at");

-- CreateIndex
CREATE INDEX "bookings_shop_client_id_idx" ON "bookings"("shop_client_id");

-- CreateIndex
CREATE INDEX "bookings_group_id_idx" ON "bookings"("group_id");

-- CreateIndex
CREATE INDEX "booking_items_booking_id_idx" ON "booking_items"("booking_id");

-- CreateIndex
CREATE INDEX "notifications_status_send_at_idx" ON "notifications"("status", "send_at");

-- CreateIndex
CREATE INDEX "notifications_booking_id_idx" ON "notifications"("booking_id");

-- CreateIndex
CREATE INDEX "audit_logs_shop_id_created_at_idx" ON "audit_logs"("shop_id", "created_at");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_hours" ADD CONSTRAINT "weekly_hours_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_overrides" ADD CONSTRAINT "schedule_overrides_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_clients" ADD CONSTRAINT "shop_clients_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_clients" ADD CONSTRAINT "shop_clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_shop_client_id_fkey" FOREIGN KEY ("shop_client_id") REFERENCES "shop_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-written: rules Prisma can't express. Keep in sync with prisma/schema.prisma.
-- ─────────────────────────────────────────────────────────────────────────────

-- No double booking, ever: two bookings of the same master whose [start, end) ranges overlap are
-- rejected by the database itself, even when two clients tap "Book" at the same moment.
-- Cancelled bookings free their time; completed and no-show ones keep it (history stays true).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "staff_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" NOT IN ('CANCELLED_CLIENT', 'CANCELLED_SHOP'));

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_time_order" CHECK ("end_at" > "start_at"),
  ADD CONSTRAINT "bookings_total_price_nonneg" CHECK ("total_price" >= 0);

ALTER TABLE "booking_items"
  ADD CONSTRAINT "booking_items_values" CHECK ("price_snapshot" >= 0 AND "duration_snapshot" > 0);

ALTER TABLE "services"
  ADD CONSTRAINT "services_values" CHECK ("price" >= 0 AND "duration_min" BETWEEN 5 AND 720);

ALTER TABLE "staff_services"
  ADD CONSTRAINT "staff_services_values" CHECK (
    ("price_override" IS NULL OR "price_override" >= 0) AND
    ("duration_override" IS NULL OR "duration_override" BETWEEN 5 AND 720)
  );

ALTER TABLE "staff"
  ADD CONSTRAINT "staff_commission_pct" CHECK ("commission_pct" IS NULL OR "commission_pct" BETWEEN 0 AND 100);

-- Schedules are minutes since Tashkent midnight; weekday 1 = Monday … 7 = Sunday.
ALTER TABLE "weekly_hours"
  ADD CONSTRAINT "weekly_hours_values" CHECK (
    "weekday" BETWEEN 1 AND 7 AND "start_min" >= 0 AND "end_min" <= 1440 AND "end_min" > "start_min"
  );

ALTER TABLE "schedule_overrides"
  ADD CONSTRAINT "schedule_overrides_values" CHECK (
    ("type" = 'DAY_OFF' AND "start_min" IS NULL AND "end_min" IS NULL) OR
    ("type" = 'CUSTOM_HOURS' AND "start_min" >= 0 AND "end_min" <= 1440 AND "end_min" > "start_min")
  );

-- Phones are stored as E.164 Uzbek numbers.
ALTER TABLE "users"
  ADD CONSTRAINT "users_phone_e164" CHECK ("phone" IS NULL OR "phone" ~ '^\+998[0-9]{9}$');
ALTER TABLE "shop_clients"
  ADD CONSTRAINT "shop_clients_phone_e164" CHECK ("phone" IS NULL OR "phone" ~ '^\+998[0-9]{9}$');

-- Shop slugs are what appears in links.
ALTER TABLE "shops"
  ADD CONSTRAINT "shops_slug_format" CHECK ("slug" ~ '^[a-z0-9-]{2,58}$');

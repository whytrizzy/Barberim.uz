-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_shop_client_id_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_staff_id_fkey";

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_shop_client_id_fkey" FOREIGN KEY ("shop_client_id") REFERENCES "shop_clients"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

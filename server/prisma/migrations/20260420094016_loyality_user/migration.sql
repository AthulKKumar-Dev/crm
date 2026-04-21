-- CreateEnum
CREATE TYPE "LoyaltyMetric" AS ENUM ('ORDERS', 'TOTAL_SPENT');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "loyalty_bronze_min" DECIMAL(12,2) NOT NULL DEFAULT 1,
ADD COLUMN     "loyalty_gold_min" DECIMAL(12,2) NOT NULL DEFAULT 15,
ADD COLUMN     "loyalty_metric" "LoyaltyMetric" NOT NULL DEFAULT 'ORDERS',
ADD COLUMN     "loyalty_platinum_min" DECIMAL(12,2) NOT NULL DEFAULT 30,
ADD COLUMN     "loyalty_silver_min" DECIMAL(12,2) NOT NULL DEFAULT 5;

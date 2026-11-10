-- AlterTable
ALTER TABLE "charge_results" ADD COLUMN "discount_cents" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "charge_results_shadow" ADD COLUMN "discount_cents" BIGINT NOT NULL DEFAULT 0;

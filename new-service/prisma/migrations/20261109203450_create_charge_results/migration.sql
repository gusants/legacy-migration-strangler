-- CreateTable
CREATE TABLE "charge_results" (
    "id" BIGSERIAL NOT NULL,
    "message_id" VARCHAR(128) NOT NULL,
    "charge_id" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "days_late" INTEGER NOT NULL,
    "fine_cents" BIGINT NOT NULL,
    "interest_cents" BIGINT NOT NULL,
    "total_cents" BIGINT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "charge_results_message_id_key" ON "charge_results"("message_id");

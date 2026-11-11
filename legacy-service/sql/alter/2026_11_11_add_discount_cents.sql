-- R7 (Pix discount). schema.sql already has the column for new databases;
-- run it on databases created before it, before deploying the controller that writes the column (safe to run again).
ALTER TABLE charge_results ADD COLUMN IF NOT EXISTS discount_cents INT NOT NULL DEFAULT 0 AFTER interest_cents;

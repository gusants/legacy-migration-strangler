-- R7 (Pix discount). schema.sql already has the column for new databases;
-- run this once on databases created before it.
ALTER TABLE charge_results ADD COLUMN discount_cents INT NOT NULL DEFAULT 0 AFTER interest_cents;

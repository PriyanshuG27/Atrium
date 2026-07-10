-- migrate:up
ALTER TABLE items ADD COLUMN IF NOT EXISTS save_time_bucket VARCHAR(20) DEFAULT NULL;

-- migrate:down
ALTER TABLE items DROP COLUMN IF EXISTS save_time_bucket;

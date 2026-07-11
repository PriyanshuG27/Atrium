-- migrate:up
ALTER TABLE items ADD COLUMN IF NOT EXISTS save_time_bucket VARCHAR(20) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mind_type_detailed TEXT DEFAULT NULL;

-- migrate:down
ALTER TABLE items DROP COLUMN IF EXISTS save_time_bucket;
ALTER TABLE users DROP COLUMN IF EXISTS mind_type_detailed;

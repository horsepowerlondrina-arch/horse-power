ALTER TABLE capture_sessions ADD COLUMN batch_id TEXT;
ALTER TABLE capture_sessions ADD COLUMN freight_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE external_captures ADD COLUMN batch_id TEXT;
ALTER TABLE external_captures ADD COLUMN source_quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE external_captures ADD COLUMN freight_total INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_external_captures_batch ON external_captures(tenant_id,batch_id,source);
INSERT INTO migrations(version) VALUES(10);

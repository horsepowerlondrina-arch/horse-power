CREATE TABLE capture_sessions_new (
 catalog_target TEXT, token_hash TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), user_id TEXT NOT NULL REFERENCES users(id),
 session_hash TEXT NOT NULL, order_id TEXT, expires_at BIGINT NOT NULL,
 FOREIGN KEY(tenant_id,order_id) REFERENCES orders(tenant_id,id)
);
INSERT INTO capture_sessions_new(token_hash,tenant_id,user_id,session_hash,order_id,expires_at) SELECT token_hash,tenant_id,user_id,session_hash,order_id,expires_at FROM capture_sessions;
DROP TABLE capture_sessions;
ALTER TABLE capture_sessions_new RENAME TO capture_sessions;
CREATE TABLE external_captures_new (
 catalog_target TEXT, id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, capture_id TEXT NOT NULL, order_id TEXT, item_id TEXT,
 catalog_id TEXT NOT NULL, source TEXT NOT NULL, external_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
 duration_seconds INTEGER, source_cost INTEGER NOT NULL, source_price INTEGER NOT NULL, vehicle_label TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,capture_id), FOREIGN KEY(tenant_id,order_id) REFERENCES orders(tenant_id,id),
 FOREIGN KEY(tenant_id,catalog_id) REFERENCES catalog(tenant_id,id)
);
INSERT INTO external_captures_new(id,tenant_id,capture_id,order_id,item_id,catalog_id,source,external_key,payload_hash,duration_seconds,source_cost,source_price,vehicle_label,created_at) SELECT id,tenant_id,capture_id,order_id,item_id,catalog_id,source,external_key,payload_hash,duration_seconds,source_cost,source_price,vehicle_label,created_at FROM external_captures;
DROP TABLE external_captures;
ALTER TABLE external_captures_new RENAME TO external_captures;
CREATE INDEX idx_capture_sessions_order ON capture_sessions(tenant_id,order_id);
CREATE INDEX idx_external_captures_order ON external_captures(tenant_id,order_id,item_id);
CREATE INDEX idx_external_captures_catalog_target ON external_captures(tenant_id,catalog_target);
ALTER TABLE tenants ADD COLUMN parts_pricing_mode TEXT NOT NULL DEFAULT 'legacy' CHECK(parts_pricing_mode IN ('legacy','markup','margin'));
ALTER TABLE tenants ADD COLUMN parts_pricing_bps INTEGER NOT NULL DEFAULT 4000 CHECK(parts_pricing_bps>=0 AND parts_pricing_bps<=100000);
INSERT INTO migrations(version) VALUES(9);
ALTER TABLE stock_movements ADD COLUMN unit_cost INTEGER;
ALTER TABLE stock_movements ADD COLUMN unit_price INTEGER;
ALTER TABLE tenants ADD COLUMN parts_pricing_rules TEXT;
ALTER TABLE capture_sessions ADD COLUMN freight_unit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog ADD COLUMN freight_unit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stock_movements ADD COLUMN freight_unit INTEGER;

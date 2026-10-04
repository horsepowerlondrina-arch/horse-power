CREATE TABLE capture_sessions (
 token_hash TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), user_id TEXT NOT NULL REFERENCES users(id),
 session_hash TEXT NOT NULL, order_id TEXT NOT NULL, expires_at BIGINT NOT NULL,
 FOREIGN KEY(tenant_id,order_id) REFERENCES orders(tenant_id,id)
);
CREATE INDEX idx_capture_sessions_order ON capture_sessions(tenant_id,order_id);
CREATE TABLE external_catalog_links (
 tenant_id TEXT NOT NULL, source TEXT NOT NULL, external_key TEXT NOT NULL, catalog_id TEXT NOT NULL,
 PRIMARY KEY(tenant_id,source,external_key), FOREIGN KEY(tenant_id,catalog_id) REFERENCES catalog(tenant_id,id)
);
CREATE TABLE external_captures (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, capture_id TEXT NOT NULL, order_id TEXT NOT NULL, item_id TEXT NOT NULL,
 catalog_id TEXT NOT NULL, source TEXT NOT NULL, external_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
 duration_seconds INTEGER, source_cost INTEGER NOT NULL, source_price INTEGER NOT NULL, vehicle_label TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,capture_id), FOREIGN KEY(tenant_id,order_id) REFERENCES orders(tenant_id,id),
 FOREIGN KEY(tenant_id,catalog_id) REFERENCES catalog(tenant_id,id)
);
CREATE INDEX idx_external_captures_order ON external_captures(tenant_id,order_id,item_id);
CREATE TABLE service_times (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, catalog_id TEXT NOT NULL, capture_id TEXT NOT NULL,
 source TEXT NOT NULL, service_name TEXT NOT NULL, make TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
 vehicle_year TEXT NOT NULL DEFAULT '', engine TEXT NOT NULL DEFAULT '', duration_seconds INTEGER NOT NULL CHECK(duration_seconds>0),
 source_price INTEGER NOT NULL CHECK(source_price>=0), captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,capture_id), FOREIGN KEY(tenant_id,catalog_id) REFERENCES catalog(tenant_id,id)
);
CREATE INDEX idx_service_times_catalog ON service_times(tenant_id,catalog_id);
INSERT INTO migrations(version) VALUES(7);

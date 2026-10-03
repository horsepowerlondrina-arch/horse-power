ALTER TABLE catalog ADD COLUMN merged_into TEXT;
CREATE TABLE service_aliases (
 tenant_id TEXT NOT NULL, alias_key TEXT NOT NULL, alias TEXT NOT NULL, catalog_id TEXT NOT NULL,
 PRIMARY KEY(tenant_id,alias_key), FOREIGN KEY(tenant_id,catalog_id) REFERENCES catalog(tenant_id,id)
);
CREATE TABLE service_merge_history (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), canonical_id TEXT NOT NULL,
 previous_records TEXT NOT NULL, merged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(tenant_id,canonical_id) REFERENCES catalog(tenant_id,id)
);
INSERT INTO migrations(version) VALUES(5);

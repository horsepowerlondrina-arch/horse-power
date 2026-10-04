ALTER TABLE tenants ADD COLUMN catalog_mode TEXT NOT NULL DEFAULT 'standard' CHECK(catalog_mode IN ('standard','extension'));
ALTER TABLE catalog ADD COLUMN archived_at TEXT;
INSERT INTO migrations(version) VALUES(8);

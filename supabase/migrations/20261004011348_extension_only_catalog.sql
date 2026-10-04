BEGIN;
ALTER TABLE horse_power.tenants ADD COLUMN catalog_mode TEXT NOT NULL DEFAULT 'standard' CHECK(catalog_mode IN ('standard','extension'));
ALTER TABLE horse_power.catalog ADD COLUMN archived_at TEXT;
INSERT INTO horse_power.migrations(version) VALUES(8);
COMMIT;

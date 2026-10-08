SET search_path=horse_power;
ALTER TABLE expense_templates ADD COLUMN supplier TEXT NOT NULL DEFAULT '';
ALTER TABLE expense_templates ADD COLUMN deleted_at TEXT;
CREATE TABLE cash_accounts (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('bank','cash')), opening_balance INTEGER NOT NULL CHECK(opening_balance BETWEEN -100000000 AND 100000000),
 opening_on TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(tenant_id,id)
);
CREATE TABLE cash_movements (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), account_id TEXT NOT NULL,
 day TEXT NOT NULL, amount BIGINT NOT NULL, gross_amount BIGINT NOT NULL DEFAULT 0, fee_amount BIGINT NOT NULL DEFAULT 0,
 description TEXT NOT NULL, method TEXT NOT NULL DEFAULT '',
 origin TEXT NOT NULL CHECK(origin IN ('receipt','expense','adjustment')), source_id TEXT NOT NULL,
 source_payload TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,origin,source_id), FOREIGN KEY(tenant_id,account_id) REFERENCES cash_accounts(tenant_id,id)
);
CREATE INDEX idx_cash_movement_account_day ON cash_movements(tenant_id,account_id,day);
INSERT INTO migrations(version) VALUES(14) ON CONFLICT DO NOTHING;

ALTER TABLE cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cash_accounts,cash_movements FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON cash_accounts,cash_movements TO horse_power_app;
CREATE POLICY backend_access ON cash_accounts FOR ALL TO horse_power_app USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON cash_movements FOR ALL TO horse_power_app USING (true) WITH CHECK (true);

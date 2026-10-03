ALTER TABLE orders ADD COLUMN source TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN historical_payment TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN product_cost_total INTEGER;
ALTER TABLE orders ADD COLUMN service_cost_total INTEGER;
ALTER TABLE orders ADD COLUMN historical_fee INTEGER;
ALTER TABLE catalog ADD COLUMN cost_known INTEGER NOT NULL DEFAULT 1;
ALTER TABLE catalog ADD COLUMN stock_verified INTEGER NOT NULL DEFAULT 1;
CREATE TABLE expense_templates (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), description TEXT NOT NULL,
 category TEXT NOT NULL, amount INTEGER CHECK(amount>=0), due_day INTEGER NOT NULL CHECK(due_day BETWEEN 1 AND 31),
 remaining_months INTEGER CHECK(remaining_months>0), start_month TEXT, source TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
 UNIQUE(tenant_id,id)
);
CREATE TABLE payables (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), template_id TEXT, description TEXT NOT NULL,
 supplier TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), due_on TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid','cancelled')), paid_on TEXT, method TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,template_id,due_on), FOREIGN KEY(tenant_id,template_id) REFERENCES expense_templates(tenant_id,id)
);
CREATE TABLE card_rates (tenant_id TEXT NOT NULL REFERENCES tenants(id), method TEXT NOT NULL, installments INTEGER NOT NULL, fee_bps INTEGER NOT NULL CHECK(fee_bps BETWEEN 0 AND 9999), factor_bps INTEGER NOT NULL, PRIMARY KEY(tenant_id,method,installments));
CREATE TABLE public_shares (token_hash TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, order_id TEXT NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(tenant_id,order_id) REFERENCES orders(tenant_id,id));
CREATE TABLE import_batches (id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, summary TEXT NOT NULL);
CREATE INDEX idx_payables_tenant_due ON payables(tenant_id,status,due_on);
INSERT INTO migrations(version) VALUES(3);

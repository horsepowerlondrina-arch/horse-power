-- Schema isolated from the Supabase Data API. Runtime access uses a dedicated backend role.
CREATE SCHEMA IF NOT EXISTS horse_power;
SET search_path=horse_power;
REVOKE ALL ON SCHEMA horse_power FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')));
ALTER TABLE "migrations" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, document TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '');
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS import_batches (id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')), summary TEXT NOT NULL);
ALTER TABLE "import_batches" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS memberships (user_id TEXT NOT NULL REFERENCES users(id), tenant_id TEXT NOT NULL REFERENCES tenants(id), role TEXT NOT NULL CHECK(role IN ('owner','operator')), PRIMARY KEY(user_id,tenant_id));
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', document TEXT NOT NULL DEFAULT '', birthday TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')), UNIQUE(tenant_id,id));
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS professionals (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Mecânico', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, UNIQUE(tenant_id,id));
ALTER TABLE "professionals" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS catalog (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), kind TEXT NOT NULL CHECK(kind IN ('product','service')), name TEXT NOT NULL, sku TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', cost INTEGER NOT NULL CHECK(cost>=0), price INTEGER NOT NULL CHECK(price>=0), stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0), minimum_stock INTEGER NOT NULL DEFAULT 0 CHECK(minimum_stock>=0), active INTEGER NOT NULL DEFAULT 1, cost_known INTEGER NOT NULL DEFAULT 1, stock_verified INTEGER NOT NULL DEFAULT 1, merged_into TEXT, UNIQUE(tenant_id,id), UNIQUE(tenant_id,sku));
ALTER TABLE "catalog" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, entity_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')));
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS payment_settings (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id), debit_fee_bps INTEGER NOT NULL DEFAULT 0 CHECK(debit_fee_bps BETWEEN 0 AND 10000),
 credit_fee_bps INTEGER NOT NULL DEFAULT 0 CHECK(credit_fee_bps BETWEEN 0 AND 10000),
 interest_bps INTEGER NOT NULL DEFAULT 0 CHECK(interest_bps BETWEEN 0 AND 10000)
);
ALTER TABLE "payment_settings" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS expense_templates (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), description TEXT NOT NULL,
 category TEXT NOT NULL, amount INTEGER CHECK(amount>=0), due_day INTEGER NOT NULL CHECK(due_day BETWEEN 1 AND 31),
 remaining_months INTEGER CHECK(remaining_months>0), start_month TEXT, source TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
 UNIQUE(tenant_id,id)
);
ALTER TABLE "expense_templates" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS card_rates (tenant_id TEXT NOT NULL REFERENCES tenants(id), method TEXT NOT NULL, installments INTEGER NOT NULL, fee_bps INTEGER NOT NULL CHECK(fee_bps BETWEEN 0 AND 9999), factor_bps INTEGER NOT NULL, PRIMARY KEY(tenant_id,method,installments));
ALTER TABLE "card_rates" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), tenant_id TEXT NOT NULL, expires_at BIGINT NOT NULL, FOREIGN KEY(user_id,tenant_id) REFERENCES memberships(user_id,tenant_id));
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS vehicles (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), customer_id TEXT NOT NULL, plate TEXT NOT NULL, brand TEXT NOT NULL, model TEXT NOT NULL, year INTEGER NOT NULL, color TEXT NOT NULL DEFAULT '', km INTEGER NOT NULL DEFAULT 0 CHECK(km>=0), chassis TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, UNIQUE(tenant_id,id), UNIQUE(tenant_id,plate), FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id));
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS payables (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), template_id TEXT, description TEXT NOT NULL,
 supplier TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), due_on TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid','cancelled')), paid_on TEXT, method TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,template_id,due_on), FOREIGN KEY(tenant_id,template_id) REFERENCES expense_templates(tenant_id,id)
);
ALTER TABLE "payables" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS service_aliases (
 tenant_id TEXT NOT NULL, alias_key TEXT NOT NULL, alias TEXT NOT NULL, catalog_id TEXT NOT NULL,
 PRIMARY KEY(tenant_id,alias_key), FOREIGN KEY(tenant_id,catalog_id) REFERENCES catalog(tenant_id,id)
);
ALTER TABLE "service_aliases" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS service_merge_history (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), canonical_id TEXT NOT NULL,
 previous_records TEXT NOT NULL, merged_at TEXT NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')),
 FOREIGN KEY(tenant_id,canonical_id) REFERENCES catalog(tenant_id,id)
);
ALTER TABLE "service_merge_history" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS "orders" (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), number INTEGER NOT NULL,
 kind TEXT NOT NULL DEFAULT 'order' CHECK(kind IN ('quote','order')),
 customer_id TEXT, vehicle_id TEXT, guest_name TEXT NOT NULL DEFAULT '', guest_plate TEXT NOT NULL DEFAULT '', guest_vehicle TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('quote','open','working','ready','completed','cancelled')),
 entered_on TEXT NOT NULL, due_on TEXT NOT NULL, completed_on TEXT, km INTEGER NOT NULL CHECK(km>=0),
 problem TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', discount INTEGER NOT NULL DEFAULT 0 CHECK(discount>=0), total INTEGER NOT NULL DEFAULT 0 CHECK(total>=0), created_at TEXT NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')), source TEXT NOT NULL DEFAULT '', historical_payment TEXT NOT NULL DEFAULT '', product_cost_total INTEGER, service_cost_total INTEGER, historical_fee INTEGER,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,number),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id), FOREIGN KEY(tenant_id,vehicle_id) REFERENCES vehicles(tenant_id,id),
 CHECK(kind='quote' OR (customer_id IS NOT NULL AND vehicle_id IS NOT NULL))
);
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, order_id TEXT NOT NULL, catalog_id TEXT NOT NULL, professional_id TEXT, kind TEXT NOT NULL, name TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), price INTEGER NOT NULL CHECK(price>=0), cost INTEGER NOT NULL CHECK(cost>=0), FOREIGN KEY(tenant_id,order_id) REFERENCES orders(tenant_id,id), FOREIGN KEY(tenant_id,catalog_id) REFERENCES catalog(tenant_id,id), FOREIGN KEY(tenant_id,professional_id) REFERENCES professionals(tenant_id,id));
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS stock_movements (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, catalog_id TEXT NOT NULL, order_id TEXT, quantity INTEGER NOT NULL, reason TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')), FOREIGN KEY(tenant_id,catalog_id) REFERENCES catalog(tenant_id,id), FOREIGN KEY(tenant_id,order_id) REFERENCES orders(tenant_id,id));
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS receivables (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, order_id TEXT NOT NULL, customer_id TEXT NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>=0), due_on TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid')), method TEXT, paid_at TEXT, plan_configured INTEGER NOT NULL DEFAULT 0, installment_count INTEGER NOT NULL DEFAULT 1, card_fee_bps INTEGER NOT NULL DEFAULT 0, interest_bps INTEGER NOT NULL DEFAULT 0, gross_total INTEGER NOT NULL DEFAULT 0, fee_total INTEGER NOT NULL DEFAULT 0, net_total INTEGER NOT NULL DEFAULT 0, UNIQUE(tenant_id,id), UNIQUE(tenant_id,order_id), FOREIGN KEY(tenant_id,order_id) REFERENCES orders(tenant_id,id), FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id));
ALTER TABLE "receivables" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public_shares (token_hash TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, order_id TEXT NOT NULL, expires_at BIGINT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')), FOREIGN KEY(tenant_id,order_id) REFERENCES orders(tenant_id,id));
ALTER TABLE "public_shares" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS payment_installments (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, receivable_id TEXT NOT NULL, sequence INTEGER NOT NULL,
 due_on TEXT NOT NULL, principal INTEGER NOT NULL CHECK(principal>=0), interest INTEGER NOT NULL CHECK(interest>=0),
 gross INTEGER NOT NULL CHECK(gross>=0), fee INTEGER NOT NULL CHECK(fee>=0), net INTEGER NOT NULL CHECK(net>=0),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid')), paid_at TEXT, method TEXT NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,receivable_id,sequence),
 FOREIGN KEY(tenant_id,receivable_id) REFERENCES receivables(tenant_id,id)
);
ALTER TABLE "payment_installments" ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS "cash_entries" (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, receivable_id TEXT NOT NULL, installment_id TEXT NOT NULL,
 amount INTEGER NOT NULL, gross_amount INTEGER NOT NULL, fee_amount INTEGER NOT NULL DEFAULT 0, method TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')),
 UNIQUE(tenant_id,installment_id),
 FOREIGN KEY(tenant_id,receivable_id) REFERENCES receivables(tenant_id,id),
 FOREIGN KEY(tenant_id,installment_id) REFERENCES payment_installments(tenant_id,id)
);
ALTER TABLE "cash_entries" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id,name);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(tenant_id,order_id);
CREATE INDEX IF NOT EXISTS idx_receivables_tenant ON receivables(tenant_id,status,due_on);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant ON vehicles(tenant_id,customer_id);
CREATE INDEX IF NOT EXISTS idx_stock_tenant ON stock_movements(tenant_id,created_at);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id,kind,status,due_on);
CREATE INDEX IF NOT EXISTS idx_installments_tenant ON payment_installments(tenant_id,receivable_id,status);
CREATE INDEX IF NOT EXISTS idx_cash_tenant ON cash_entries(tenant_id,created_at);
CREATE INDEX IF NOT EXISTS idx_payables_tenant_due ON payables(tenant_id,status,due_on);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payable_template_month ON payables(tenant_id,template_id,substr(due_on,1,7));
CREATE TABLE IF NOT EXISTS admin_setup (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at BIGINT NOT NULL, used_at TEXT);
ALTER TABLE admin_setup ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_at BIGINT NOT NULL);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

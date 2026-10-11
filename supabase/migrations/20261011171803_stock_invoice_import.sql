CREATE TABLE horse_power.stock_invoices (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES horse_power.tenants(id),
 invoice_key TEXT NOT NULL, supplier_document TEXT NOT NULL, supplier_name TEXT NOT NULL,
 invoice_number TEXT NOT NULL, issued_on TEXT NOT NULL, xml_hash TEXT NOT NULL,
 summary TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES horse_power.users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,invoice_key)
);
CREATE TABLE horse_power.stock_invoice_products (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES horse_power.tenants(id),
 supplier_document TEXT NOT NULL, supplier_code TEXT NOT NULL, unit TEXT NOT NULL,
 gtin TEXT NOT NULL DEFAULT '', catalog_id TEXT NOT NULL,
 quantity_factor REAL NOT NULL DEFAULT 1 CHECK(quantity_factor>0),
 UNIQUE(tenant_id,supplier_document,supplier_code,unit),
 FOREIGN KEY(tenant_id,catalog_id) REFERENCES horse_power.catalog(tenant_id,id)
);
CREATE INDEX idx_stock_invoices_tenant ON horse_power.stock_invoices(tenant_id,created_at);
CREATE INDEX idx_stock_invoice_gtin ON horse_power.stock_invoice_products(tenant_id,gtin);
INSERT INTO horse_power.migrations(version) VALUES(18);

ALTER TABLE horse_power.stock_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_power.stock_invoice_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON horse_power.stock_invoices FOR ALL TO horse_power_app USING(true) WITH CHECK(true);
CREATE POLICY backend_access ON horse_power.stock_invoice_products FOR ALL TO horse_power_app USING(true) WITH CHECK(true);
REVOKE ALL ON horse_power.stock_invoices,horse_power.stock_invoice_products FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON horse_power.stock_invoices,horse_power.stock_invoice_products TO horse_power_app;

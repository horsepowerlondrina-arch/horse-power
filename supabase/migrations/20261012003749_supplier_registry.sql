CREATE TABLE horse_power.suppliers (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES horse_power.tenants(id),
 name TEXT NOT NULL, trade_name TEXT NOT NULL DEFAULT '', document TEXT,
 phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
 address TEXT NOT NULL DEFAULT '', number TEXT NOT NULL DEFAULT '', complement TEXT NOT NULL DEFAULT '',
 district TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '',
 postal_code TEXT NOT NULL DEFAULT '', seller TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,document)
);
CREATE INDEX idx_suppliers_tenant_name ON horse_power.suppliers(tenant_id,name);
ALTER TABLE horse_power.stock_invoices ADD COLUMN supplier_id TEXT;
ALTER TABLE horse_power.stock_invoice_products ADD COLUMN supplier_id TEXT;
ALTER TABLE horse_power.stock_invoice_products ADD COLUMN last_cost INTEGER CHECK(last_cost>=0);
ALTER TABLE horse_power.stock_invoice_products ADD COLUMN last_purchase_on TEXT NOT NULL DEFAULT '';
INSERT INTO horse_power.suppliers(id,tenant_id,name,document)
SELECT gen_random_uuid()::text,tenant_id,max(supplier_name),supplier_document
FROM horse_power.stock_invoices GROUP BY tenant_id,supplier_document;
UPDATE horse_power.stock_invoices i SET supplier_id=s.id FROM horse_power.suppliers s WHERE s.tenant_id=i.tenant_id AND s.document=i.supplier_document;
UPDATE horse_power.stock_invoice_products p SET supplier_id=s.id FROM horse_power.suppliers s WHERE s.tenant_id=p.tenant_id AND s.document=p.supplier_document;
ALTER TABLE horse_power.stock_invoices ADD CONSTRAINT stock_invoice_supplier_fk FOREIGN KEY(tenant_id,supplier_id) REFERENCES horse_power.suppliers(tenant_id,id);
ALTER TABLE horse_power.stock_invoice_products ADD CONSTRAINT stock_product_supplier_fk FOREIGN KEY(tenant_id,supplier_id) REFERENCES horse_power.suppliers(tenant_id,id);
CREATE INDEX idx_stock_invoice_supplier ON horse_power.stock_invoices(tenant_id,supplier_id);
CREATE INDEX idx_stock_product_supplier ON horse_power.stock_invoice_products(tenant_id,supplier_id);
INSERT INTO horse_power.migrations(version) VALUES(19);
ALTER TABLE horse_power.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON horse_power.suppliers FOR ALL TO horse_power_app USING(true) WITH CHECK(true);
REVOKE ALL ON horse_power.suppliers FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON horse_power.suppliers TO horse_power_app;

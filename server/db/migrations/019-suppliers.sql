CREATE TABLE suppliers (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
 name TEXT NOT NULL, trade_name TEXT NOT NULL DEFAULT '', document TEXT,
 phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
 address TEXT NOT NULL DEFAULT '', number TEXT NOT NULL DEFAULT '', complement TEXT NOT NULL DEFAULT '',
 district TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '',
 postal_code TEXT NOT NULL DEFAULT '', seller TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,document)
);
CREATE INDEX idx_suppliers_tenant_name ON suppliers(tenant_id,name);
ALTER TABLE stock_invoices ADD COLUMN supplier_id TEXT REFERENCES suppliers(id);
ALTER TABLE stock_invoice_products ADD COLUMN supplier_id TEXT REFERENCES suppliers(id);
ALTER TABLE stock_invoice_products ADD COLUMN last_cost INTEGER CHECK(last_cost>=0);
ALTER TABLE stock_invoice_products ADD COLUMN last_purchase_on TEXT NOT NULL DEFAULT '';
INSERT INTO suppliers(id,tenant_id,name,document)
SELECT lower(hex(randomblob(16))),tenant_id,max(supplier_name),supplier_document
FROM stock_invoices GROUP BY tenant_id,supplier_document;
UPDATE stock_invoices SET supplier_id=(SELECT s.id FROM suppliers s WHERE s.tenant_id=stock_invoices.tenant_id AND s.document=stock_invoices.supplier_document);
UPDATE stock_invoice_products SET supplier_id=(SELECT s.id FROM suppliers s WHERE s.tenant_id=stock_invoice_products.tenant_id AND s.document=stock_invoice_products.supplier_document);
CREATE INDEX idx_stock_invoice_supplier ON stock_invoices(tenant_id,supplier_id);
CREATE INDEX idx_stock_product_supplier ON stock_invoice_products(tenant_id,supplier_id);
INSERT INTO migrations(version) VALUES(19);

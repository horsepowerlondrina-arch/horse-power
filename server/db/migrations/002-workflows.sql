CREATE TABLE orders_next (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), number INTEGER NOT NULL,
 kind TEXT NOT NULL DEFAULT 'order' CHECK(kind IN ('quote','order')),
 customer_id TEXT, vehicle_id TEXT, guest_name TEXT NOT NULL DEFAULT '', guest_plate TEXT NOT NULL DEFAULT '', guest_vehicle TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('quote','open','working','ready','completed','cancelled')),
 entered_on TEXT NOT NULL, due_on TEXT NOT NULL, completed_on TEXT, km INTEGER NOT NULL CHECK(km>=0),
 problem TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', discount INTEGER NOT NULL DEFAULT 0 CHECK(discount>=0), total INTEGER NOT NULL DEFAULT 0 CHECK(total>=0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,number),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id), FOREIGN KEY(tenant_id,vehicle_id) REFERENCES vehicles(tenant_id,id),
 CHECK(kind='quote' OR (customer_id IS NOT NULL AND vehicle_id IS NOT NULL))
);
INSERT INTO orders_next(id,tenant_id,number,kind,customer_id,vehicle_id,status,entered_on,due_on,completed_on,km,problem,notes,discount,total,created_at)
SELECT id,tenant_id,number,CASE WHEN status='quote' THEN 'quote' ELSE 'order' END,customer_id,vehicle_id,status,entered_on,due_on,completed_on,km,problem,notes,discount,total,created_at FROM orders;
DROP TABLE orders;
ALTER TABLE orders_next RENAME TO orders;
CREATE INDEX idx_orders_tenant ON orders(tenant_id,kind,status,due_on);
ALTER TABLE receivables ADD COLUMN plan_configured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receivables ADD COLUMN installment_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE receivables ADD COLUMN card_fee_bps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receivables ADD COLUMN interest_bps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receivables ADD COLUMN gross_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receivables ADD COLUMN fee_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receivables ADD COLUMN net_total INTEGER NOT NULL DEFAULT 0;
UPDATE receivables SET gross_total=amount,net_total=amount,plan_configured=CASE WHEN status='paid' THEN 1 ELSE 0 END;
CREATE TABLE payment_installments (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, receivable_id TEXT NOT NULL, sequence INTEGER NOT NULL,
 due_on TEXT NOT NULL, principal INTEGER NOT NULL CHECK(principal>=0), interest INTEGER NOT NULL CHECK(interest>=0),
 gross INTEGER NOT NULL CHECK(gross>=0), fee INTEGER NOT NULL CHECK(fee>=0), net INTEGER NOT NULL CHECK(net>=0),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid')), paid_at TEXT, method TEXT NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,receivable_id,sequence),
 FOREIGN KEY(tenant_id,receivable_id) REFERENCES receivables(tenant_id,id)
);
INSERT INTO payment_installments(id,tenant_id,receivable_id,sequence,due_on,principal,interest,gross,fee,net,status,paid_at,method)
SELECT 'legacy-'||id,tenant_id,id,1,due_on,amount,0,amount,0,amount,'paid',paid_at,COALESCE(method,'Pix') FROM receivables WHERE status='paid';
CREATE TABLE cash_entries_next (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, receivable_id TEXT NOT NULL, installment_id TEXT NOT NULL,
 amount INTEGER NOT NULL, gross_amount INTEGER NOT NULL, fee_amount INTEGER NOT NULL DEFAULT 0, method TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,installment_id),
 FOREIGN KEY(tenant_id,receivable_id) REFERENCES receivables(tenant_id,id),
 FOREIGN KEY(tenant_id,installment_id) REFERENCES payment_installments(tenant_id,id)
);
INSERT INTO cash_entries_next(id,tenant_id,receivable_id,installment_id,amount,gross_amount,fee_amount,method,created_at)
SELECT id,tenant_id,receivable_id,'legacy-'||receivable_id,amount,amount,0,method,created_at FROM cash_entries;
DROP TABLE cash_entries;
ALTER TABLE cash_entries_next RENAME TO cash_entries;
CREATE TABLE payment_settings (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id), debit_fee_bps INTEGER NOT NULL DEFAULT 0 CHECK(debit_fee_bps BETWEEN 0 AND 10000),
 credit_fee_bps INTEGER NOT NULL DEFAULT 0 CHECK(credit_fee_bps BETWEEN 0 AND 10000),
 interest_bps INTEGER NOT NULL DEFAULT 0 CHECK(interest_bps BETWEEN 0 AND 10000)
);
CREATE INDEX idx_installments_tenant ON payment_installments(tenant_id,receivable_id,status);
CREATE INDEX idx_cash_tenant ON cash_entries(tenant_id,created_at);
INSERT INTO migrations(version) VALUES(2);

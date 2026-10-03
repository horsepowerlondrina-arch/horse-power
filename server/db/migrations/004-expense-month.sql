CREATE UNIQUE INDEX idx_payable_template_month ON payables(tenant_id,template_id,substr(due_on,1,7));
INSERT INTO migrations(version) VALUES(4);

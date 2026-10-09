SET search_path=horse_power;
CREATE TABLE product_categories (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL,
 name_key TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(tenant_id,name_key)
);
CREATE INDEX idx_product_categories_active ON product_categories(tenant_id,active,name);
INSERT INTO product_categories(id,tenant_id,name,name_key)
SELECT gen_random_uuid()::text,tenant_id,min(trim(category)),lower(trim(category)) FROM catalog
WHERE kind='product' AND trim(category)<>'' AND lower(trim(category)) NOT IN ('sky peças','skypeças','skypecas','accioly','scherer','histórico importado','importado do histórico','importação os em andamento')
GROUP BY tenant_id,lower(trim(category)) ON CONFLICT (tenant_id,name_key) DO NOTHING;
INSERT INTO product_categories(id,tenant_id,name,name_key) SELECT gen_random_uuid()::text,id,'ACESSORIO','acessorio' FROM tenants ON CONFLICT (tenant_id,name_key) DO NOTHING;
INSERT INTO product_categories(id,tenant_id,name,name_key) SELECT gen_random_uuid()::text,id,'ADM','adm' FROM tenants ON CONFLICT (tenant_id,name_key) DO NOTHING;
INSERT INTO product_categories(id,tenant_id,name,name_key) SELECT gen_random_uuid()::text,id,'ALTERNADOR','alternador' FROM tenants ON CONFLICT (tenant_id,name_key) DO NOTHING;
INSERT INTO product_categories(id,tenant_id,name,name_key) SELECT gen_random_uuid()::text,id,'ARREFECIMENTO','arrefecimento' FROM tenants ON CONFLICT (tenant_id,name_key) DO NOTHING;
INSERT INTO product_categories(id,tenant_id,name,name_key) SELECT gen_random_uuid()::text,id,'CABO','cabo' FROM tenants ON CONFLICT (tenant_id,name_key) DO NOTHING;
INSERT INTO product_categories(id,tenant_id,name,name_key) SELECT gen_random_uuid()::text,id,'CAMBIO','cambio' FROM tenants ON CONFLICT (tenant_id,name_key) DO NOTHING;
INSERT INTO migrations(version) VALUES(15) ON CONFLICT DO NOTHING;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON product_categories FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON product_categories TO horse_power_app;
CREATE POLICY backend_access ON product_categories FOR ALL TO horse_power_app USING (true) WITH CHECK (true);

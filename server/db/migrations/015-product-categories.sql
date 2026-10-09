CREATE TABLE product_categories (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL,
 name_key TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(tenant_id,name_key)
);
CREATE INDEX idx_product_categories_active ON product_categories(tenant_id,active,name);
INSERT OR IGNORE INTO product_categories(id,tenant_id,name,name_key)
SELECT lower(hex(randomblob(16))),tenant_id,min(trim(category)),lower(trim(category)) FROM catalog
WHERE kind='product' AND trim(category)<>'' AND lower(trim(category)) NOT IN ('sky peças','skypeças','skypecas','accioly','scherer','histórico importado','importado do histórico','importação os em andamento')
GROUP BY tenant_id,lower(trim(category));
INSERT OR IGNORE INTO product_categories(id,tenant_id,name,name_key) SELECT lower(hex(randomblob(16))),id,'ACESSORIO','acessorio' FROM tenants;
INSERT OR IGNORE INTO product_categories(id,tenant_id,name,name_key) SELECT lower(hex(randomblob(16))),id,'ADM','adm' FROM tenants;
INSERT OR IGNORE INTO product_categories(id,tenant_id,name,name_key) SELECT lower(hex(randomblob(16))),id,'ALTERNADOR','alternador' FROM tenants;
INSERT OR IGNORE INTO product_categories(id,tenant_id,name,name_key) SELECT lower(hex(randomblob(16))),id,'ARREFECIMENTO','arrefecimento' FROM tenants;
INSERT OR IGNORE INTO product_categories(id,tenant_id,name,name_key) SELECT lower(hex(randomblob(16))),id,'CABO','cabo' FROM tenants;
INSERT OR IGNORE INTO product_categories(id,tenant_id,name,name_key) SELECT lower(hex(randomblob(16))),id,'CAMBIO','cambio' FROM tenants;
INSERT INTO migrations(version) VALUES(15);

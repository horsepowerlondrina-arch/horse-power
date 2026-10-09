SET search_path=horse_power;
ALTER TABLE catalog ADD COLUMN brand TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog ADD COLUMN manufacturer_code TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog ADD COLUMN application TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog ADD COLUMN usage_vehicles TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog ADD COLUMN category_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(category_confirmed IN (0,1));
UPDATE catalog SET
 manufacturer_code=COALESCE((SELECT split_part(l.external_key,'|',1) FROM external_catalog_links l WHERE l.tenant_id=catalog.tenant_id AND l.catalog_id=catalog.id AND l.source='sky'), ''),
 brand=COALESCE((SELECT split_part(l.external_key,'|',2) FROM external_catalog_links l WHERE l.tenant_id=catalog.tenant_id AND l.catalog_id=catalog.id AND l.source='sky'), '')
 WHERE kind='product' AND (SELECT count(*) FROM external_catalog_links l WHERE l.tenant_id=catalog.tenant_id AND l.catalog_id=catalog.id AND l.source='sky')=1;
UPDATE catalog SET category_confirmed=1 WHERE kind='product' AND EXISTS(SELECT 1 FROM product_categories c WHERE c.tenant_id=catalog.tenant_id AND c.name=catalog.category AND c.active=1);
UPDATE catalog SET usage_vehicles=COALESCE((SELECT string_agg(DISTINCT (v.brand || ' · ' || v.model || ' · ' || v.year::text),', ') FROM order_items i JOIN orders o ON o.id=i.order_id AND o.tenant_id=i.tenant_id JOIN vehicles v ON v.id=o.vehicle_id AND v.tenant_id=o.tenant_id WHERE i.tenant_id=catalog.tenant_id AND i.catalog_id=catalog.id),'') WHERE kind='product';
INSERT INTO migrations(version) VALUES(16) ON CONFLICT DO NOTHING;

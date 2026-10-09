ALTER TABLE catalog ADD COLUMN brand TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog ADD COLUMN manufacturer_code TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog ADD COLUMN application TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog ADD COLUMN usage_vehicles TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog ADD COLUMN category_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(category_confirmed IN (0,1));
UPDATE catalog SET
 manufacturer_code=COALESCE((SELECT substr(l.external_key,1,instr(l.external_key,'|')-1) FROM external_catalog_links l WHERE l.tenant_id=catalog.tenant_id AND l.catalog_id=catalog.id AND l.source='sky'), ''),
 brand=COALESCE((SELECT substr(l.external_key,instr(l.external_key,'|')+1) FROM external_catalog_links l WHERE l.tenant_id=catalog.tenant_id AND l.catalog_id=catalog.id AND l.source='sky'), '')
 WHERE kind='product' AND (SELECT count(*) FROM external_catalog_links l WHERE l.tenant_id=catalog.tenant_id AND l.catalog_id=catalog.id AND l.source='sky')=1;
UPDATE catalog SET category_confirmed=1 WHERE kind='product' AND EXISTS(SELECT 1 FROM product_categories c WHERE c.tenant_id=catalog.tenant_id AND c.name=catalog.category AND c.active=1);
UPDATE catalog SET usage_vehicles=COALESCE((SELECT group_concat(DISTINCT v.brand || ' · ' || v.model || ' · ' || v.year) FROM order_items i JOIN orders o ON o.id=i.order_id AND o.tenant_id=i.tenant_id JOIN vehicles v ON v.id=o.vehicle_id AND v.tenant_id=o.tenant_id WHERE i.tenant_id=catalog.tenant_id AND i.catalog_id=catalog.id),'') WHERE kind='product';
INSERT INTO migrations(version) VALUES(16);

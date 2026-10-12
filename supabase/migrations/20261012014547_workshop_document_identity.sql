ALTER TABLE horse_power.tenants ADD COLUMN legal_name TEXT NOT NULL DEFAULT '';
ALTER TABLE horse_power.tenants ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE horse_power.tenants ADD COLUMN city TEXT NOT NULL DEFAULT '';
ALTER TABLE horse_power.tenants ADD COLUMN state TEXT NOT NULL DEFAULT '';
ALTER TABLE horse_power.tenants ADD COLUMN document_logo TEXT NOT NULL DEFAULT '';
UPDATE horse_power.tenants SET email='horsepowerlondrina@gmail.com',city='Londrina',state='PR',document_logo='/brand/icon.jpg' WHERE id='hp-centro';
INSERT INTO horse_power.migrations(version) VALUES(20);

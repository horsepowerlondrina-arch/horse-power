ALTER TABLE tenants ADD COLUMN legal_name TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN city TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN state TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN document_logo TEXT NOT NULL DEFAULT '';
UPDATE tenants SET email='horsepowerlondrina@gmail.com',city='Londrina',state='PR',document_logo='/brand/icon.jpg' WHERE id='hp-centro';
INSERT INTO migrations(version) VALUES(20);

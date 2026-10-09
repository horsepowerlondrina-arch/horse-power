ALTER TABLE receivables ADD COLUMN card_sale_on TEXT NOT NULL DEFAULT '';
INSERT INTO migrations(version) VALUES(17);

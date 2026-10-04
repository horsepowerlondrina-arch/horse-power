ALTER TABLE public_shares ADD COLUMN token_value TEXT;
CREATE INDEX IF NOT EXISTS idx_public_shares_order_active
  ON public_shares(tenant_id,order_id,revoked,expires_at);
INSERT INTO migrations(version) VALUES(11);

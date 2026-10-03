CREATE TABLE admin_setup (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL, used_at TEXT);
CREATE TABLE login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_at INTEGER NOT NULL);
INSERT INTO migrations(version) VALUES(6);

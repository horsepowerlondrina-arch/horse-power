"""Create a consistent local backup and a private SQL import, without changing local data."""
import sqlite3, pathlib, re, json, datetime, hashlib, secrets
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'data/cloud';out.mkdir(parents=True,exist_ok=True)
source=sqlite3.connect(str(root/'data/horse-power.sqlite'))
backup=out/('pre-cloud-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')+'.sqlite')
db=sqlite3.connect(backup);source.backup(db);source.close();db.row_factory=sqlite3.Row
assert not db.execute('PRAGMA foreign_key_check').fetchall()
tables={r['name']:r['sql'] for r in db.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
ordered=[]
while len(ordered)<len(tables):
 ready=[t for t in tables if t not in ordered and all(f['table'] in ordered or f['table']==t for f in db.execute(f'PRAGMA foreign_key_list("{t}")'))]
 assert ready,'Cyclic foreign keys require manual review'
 ordered.extend(ready)
schema=['CREATE SCHEMA IF NOT EXISTS horse_power;', 'SET search_path=horse_power;', 'REVOKE ALL ON SCHEMA horse_power FROM PUBLIC, anon, authenticated;']
for t in ordered:
 s=tables[t]
 s=re.sub(r'\bCREATE TABLE\s+(?:IF NOT EXISTS\s+)?', 'CREATE TABLE IF NOT EXISTS ',s, count=1,flags=re.I)
 s=re.sub(r'\bexpires_at INTEGER\b','expires_at BIGINT',s)
 s=s.replace('DEFAULT CURRENT_TIMESTAMP',"DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'))")
 schema +=[s+';',f'ALTER TABLE "{t}" ENABLE ROW LEVEL SECURITY;']
for r in db.execute("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"):
 schema.append(r['sql'].replace('CREATE UNIQUE INDEX ','CREATE UNIQUE INDEX IF NOT EXISTS ').replace('CREATE INDEX ','CREATE INDEX IF NOT EXISTS ')+';')
schema += ['CREATE TABLE IF NOT EXISTS admin_setup (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at BIGINT NOT NULL, used_at TEXT);','ALTER TABLE admin_setup ENABLE ROW LEVEL SECURITY;','CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_at BIGINT NOT NULL);','ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;']
path=next((root/'supabase/migrations').glob('*_horse_power_cloud.sql'))
path.write_text('-- Schema isolated from the Supabase Data API. Runtime access uses a dedicated backend role.\n'+'\n'.join(schema)+'\n')
def lit(v):
 if v is None:return 'NULL'
 if isinstance(v,(int,float)):return str(v)
 return "'"+str(v).replace("'","''")+"'"
rows={}
for t in ordered:
 cols=[r['name'] for r in db.execute(f'PRAGMA table_info("{t}")')]
 if t in ('sessions','public_shares','import_batches'): values=[]
 elif t=='tenants': values=db.execute('SELECT * FROM tenants WHERE id=?',('hp-centro',)).fetchall()
 elif t=='users': values=db.execute("SELECT * FROM users WHERE id IN (SELECT user_id FROM memberships WHERE tenant_id='hp-centro' UNION SELECT user_id FROM audit_events WHERE tenant_id='hp-centro' UNION SELECT user_id FROM stock_movements WHERE tenant_id='hp-centro')").fetchall()
 elif t=='memberships':values=db.execute("SELECT * FROM memberships WHERE tenant_id='hp-centro' AND role='owner'").fetchall()
 elif 'tenant_id' in cols:values=db.execute(f'SELECT * FROM "{t}" WHERE tenant_id=?',('hp-centro',)).fetchall()
 else:values=db.execute(f'SELECT * FROM "{t}"').fetchall()
 rows[t]=[dict(r) for r in values]
 if t=='users':
  for r in rows[t]:
   salt=secrets.token_hex(16);r['password_hash']=salt+':'+secrets.token_hex(64)
   if r['id']=='demo-owner':r['email']='horsepowerlondrina@gmail.com';r['name']='Administrador Horse Power'
statements=['BEGIN;','SET LOCAL search_path=horse_power;',"SELECT pg_advisory_xact_lock(721834109);","DO $$ BEGIN IF EXISTS(SELECT 1 FROM tenants) THEN RAISE EXCEPTION 'Cloud import requires an empty target'; END IF; END $$;"]
for t in ordered:
 if not rows[t]:continue
 cols=list(rows[t][0]);colsql=','.join('"'+c+'"' for c in cols)
 for start in range(0,len(rows[t]),100):
  values=','.join('('+','.join(lit(r[c]) for c in cols)+')' for r in rows[t][start:start+100])
  statements.append(f'INSERT INTO "{t}" ({colsql}) VALUES {values};')
statements.append('COMMIT;')
(out/'import.sql').write_text('\n'.join(statements));(out/'import.sql').chmod(0o600)
summary={'backup':str(backup),'counts':{t:len(v) for t,v in rows.items()},'orders_total':sum(r['total'] for r in rows['orders'])}
(out/'expected.json').write_text(json.dumps(summary,indent=2))
# Comparison export stays local; credentials and setup/session rows are deliberately excluded.
(out/'expected-rows.json').write_text(json.dumps({t:v for t,v in rows.items() if t not in ('users','memberships','sessions','public_shares','import_batches')},ensure_ascii=False))
print(json.dumps(summary,indent=2))

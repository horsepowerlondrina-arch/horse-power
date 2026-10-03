import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createPostgresDatabase } from '../server/db/postgres';
import { digest } from '../server/auth/session';
const db=createPostgresDatabase();
const base=process.env.VERIFY_ORIGIN || 'https://horse-power.vercel.app';
const token=randomBytes(32).toString('hex');
try {
 await db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token),'demo-owner','hp-centro',Date.now()+120000);
 const get=async(path:string)=>{const r=await fetch(base+'/api'+path,{headers:{Cookie:`hp_session=${token}`}});assert.equal(r.status,200,path);return r.json();};
 const session=await get('/session');assert.equal(session.user.email,'horsepowerlondrina@gmail.com');assert.equal(session.role,'owner');
 const data=await get('/workspace');assert.equal(data.customers.length,119);assert.equal(data.vehicles.length,143);assert.equal(data.orders.length,232);assert.equal(data.orders.reduce((s:number,r:any)=>s+r.total,0),19589763);assert.equal(data.plate_lookup_enabled,true);
 const expenses=await get('/expenses');assert.equal(expenses.templates.length,29);
 const response=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({email:'demo@horsepower.local',password:'HorsePower@2026'})});assert.equal(response.status,401);
 console.log('Vercel → servidor → Supabase verificados: sessão, oficina, 119 clientes, 143 veículos, 232 documentos, valores, despesas e chave de placas. Login provisório rejeitado.');
} finally {await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));await db.close();}

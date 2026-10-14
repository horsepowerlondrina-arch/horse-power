import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../server/db/database';
import {createProductBatch} from '../server/services/productBatch';
import {allocateFreight} from '../shared/freight';
import {createApp} from '../server/app';
import {digest} from '../server/auth/session';
const ctx={userId:'u',tenantId:'a',role:'owner'};
function fixture() {
  const db=createDatabase(':memory:');
  db.exec("INSERT INTO tenants(id,name,parts_pricing_mode,parts_pricing_bps) VALUES('a','A','markup',4000),('b','B','markup',1000); INSERT INTO users VALUES('u','Admin','admin@test.invalid','disabled'); INSERT INTO memberships VALUES('u','a','owner'); INSERT INTO product_categories(id,tenant_id,name,name_key) VALUES('cat','a','FILTRO','filtro'),('other','b','MOTOR','motor')");
  return db;
}
const payload=()=>({request_id:randomUUID(),freight_total:1750,items:[
  {name:'Filtro de óleo',sku:'F1',brand:'Marca A',manufacturer_code:'OC606',application:'Motor 1.6',category:'FILTRO',cost:1000,quantity:2},
  {name:'Filtro de ar',sku:'F2',brand:'Marca B',manufacturer_code:'AR123',cost:3000,quantity:1},
]});
test('authenticated batch API validates the complete list and saves it once',async()=>{
  const db=fixture();
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest('owner'),'u','a',Date.now()+60000);
  const server=createApp(db).listen(0,'127.0.0.1');
  await new Promise<void>(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${(server.address() as any).port}/api/catalog-batch`;
  const post=(body:any,cookie='owner')=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`hp_session=${cookie}`},body:JSON.stringify(body)});
  try {
    const unauth=await post(payload(),'invalid');assert.equal(unauth.status,401);await unauth.text();
    const invalid=await post({...payload(),freight_total:-1});assert.equal(invalid.status,400);await invalid.text();
    assert.equal(db.prepare('SELECT COUNT(*) n FROM catalog').get()!.n,0);
    const input=payload();
    for(let i=0;i<2;i++){const response=await post(input);assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,count:2});}
    assert.equal(db.prepare('SELECT COUNT(*) n FROM catalog').get()!.n,2);
  } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));db.close();}
});
test('manual purchase shares freight by cost and quantity, applies tenant pricing and retries without stock or duplicates',async()=>{
  const db=fixture();try {
    const input=payload();
    assert.equal((await createProductBatch(db,ctx,input)).count,2);
    await createProductBatch(db,ctx,input);
    const rows=db.prepare("SELECT * FROM catalog WHERE tenant_id='a' ORDER BY sku").all();
    assert.equal(rows.length,2);
    assert.equal(rows[0].freight_unit,350);
    assert.equal(rows[0].cost,1350);
    assert.equal(rows[0].price,1890);
    assert.equal(rows[0].brand,'Marca A');
    assert.equal(rows[0].manufacturer_code,'OC606');
    assert.equal(rows[0].application,'Motor 1.6');
    assert.equal(rows[0].category,'FILTRO');
    assert.equal(rows[1].freight_unit,1050);
    assert.equal(rows[1].cost,4050);
    assert.equal(rows[1].price,5670);
    for(const row of rows){assert.equal(row.stock,0);assert.equal(row.cost_known,1);}
    assert.equal(db.prepare('SELECT COUNT(*) n FROM stock_movements').get()!.n,0);
    await assert.rejects(createProductBatch(db,ctx,{...input,freight_total:2000}),/já foi salva/);
  } finally {db.close();}
});
test('invalid category, duplicate reference, over-limit price and forbidden role cannot leave partial registrations',async()=>{
  const db=fixture();try {
    const bad=payload();bad.items[1].category='MOTOR';
    await assert.rejects(createProductBatch(db,ctx,bad),/categoria/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM catalog').get()!.n,0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_events').get()!.n,0);
    const repeat=payload();repeat.items[1].sku='f1';
    await assert.rejects(createProductBatch(db,ctx,repeat),/repetidas/);
    await assert.rejects(createProductBatch(db,{...ctx,role:'operator'},payload()),/administrador/);
    const overflow=payload();overflow.items[1].cost=100000000;
    await assert.rejects(createProductBatch(db,ctx,overflow),/limite/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM catalog').get()!.n,0);
    await createProductBatch(db,ctx,payload());
    await assert.rejects(createProductBatch(db,ctx,payload()),/já está cadastrada/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM catalog').get()!.n,2);
    const other=payload();other.freight_total=0;other.items.forEach(i=>i.category='');
    await createProductBatch(db,{...ctx,tenantId:'b'},other);
    assert.equal(db.prepare("SELECT price FROM catalog WHERE tenant_id='b' AND sku='F1'").get()!.price,1100);
  } finally {db.close();}
});
test('cent allocation is exact and deterministic including quantities and zero-cost rows',()=>{
  const items=[{id:'a',cost:1,quantity:3},{id:'b',cost:2,quantity:1},{id:'c',cost:0,quantity:5}];
  const shares=allocateFreight(items,7);
  assert.deepEqual(shares.map(i=>i.freight_total),[4,3,0]);
  assert.equal(shares.reduce((s,r)=>s+r.freight_total,0),7);
  assert.deepEqual(allocateFreight([{id:'b',cost:1,quantity:1},{id:'a',cost:1,quantity:1}],1).map(r=>r.freight_total),[0,1]);
  assert.throws(()=>allocateFreight([{id:'a',cost:0,quantity:1}],1),/Informe o custo/);
  assert.throws(()=>allocateFreight([{id:'a',cost:1,quantity:1.5}],1),/Revise/);
});

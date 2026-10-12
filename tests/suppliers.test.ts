import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../server/db/database";
import { createApp } from "../server/app";
import { digest } from "../server/auth/session";
import { saveSupplier, listSuppliers, supplierDetails } from "../server/services/suppliers";
import { previewStockInvoice, importStockInvoice } from "../server/services/stockInvoices";
import { postgresSql } from "../server/db/postgres";

const ctx={tenantId:"a",userId:"u",role:"owner"};
function fixture() {
 const db=createDatabase(":memory:");
 db.exec("INSERT INTO tenants(id,name) VALUES('a','A'),('b','B'); INSERT INTO users VALUES('u','U','u@example.test','disabled'),('m','M','m@example.test','disabled'); INSERT INTO memberships VALUES('u','a','owner'),('u','b','owner'),('m','a','operator'); INSERT INTO catalog(id,tenant_id,kind,name,sku,brand,cost,price) VALUES('p','a','product','Filtro','P','Marca própria',1000,2000),('foreign','b','product','Filtro','F','Outra',1000,2000)");
 return db;
}
function xml(number=1,document="12345678000195",cost="40.00",date="2026-10-11") {
 const raw="412610"+document+"55"+"001"+String(number).padStart(9,"0")+"1"+"12345678";
 let sum=0;for(let i=42,w=2;i>=0;i--,w=w===9?2:w+1)sum+=Number(raw[i])*w;
 const dv=11-sum%11,key=raw+(dv>=10?0:dv);
 return `<nfeProc><NFe><infNFe Id="NFe${key}"><ide><mod>55</mod><tpAmb>1</tpAmb><tpNF>1</tpNF><nNF>${number}</nNF><dhEmi>${date}</dhEmi></ide><emit><CNPJ>${document}</CNPJ><xNome>Fornecedor &amp; Cia</xNome><xFant>Peças</xFant><enderEmit><xLgr>Rua Um</xLgr><nro>10</nro><xBairro>Centro</xBairro><xMun>Londrina</xMun><UF>PR</UF><CEP>86000000</CEP><fone>43999990000</fone></enderEmit></emit><det nItem="1"><prod><cProd>00001</cProd><cEAN>SEM GTIN</cEAN><xProd>Filtro</xProd><uCom>UN</uCom><qCom>2.0000</qCom><vProd>${cost}</vProd><vFrete>4.00</vFrete></prod></det></infNFe></NFe><protNFe><infProt><tpAmb>1</tpAmb><chNFe>${key}</chNFe><cStat>100</cStat></infProt></protNFe></nfeProc>`;
}
const choices=[{line:"1",catalog_id:"p",quantity:2}];

test("supplier creation and editing normalize documents, prevent duplicates and isolate tenants",async()=>{
 const db=fixture();
 try {
  const id=await saveSupplier(db,ctx,{name:"Fornecedor",document:"12.345.678/0001-95",seller:"Ana"});
  await assert.rejects(()=>saveSupplier(db,ctx,{name:"Duplicado",document:"12345678000195"}),/Já existe/);
  await saveSupplier(db,{...ctx,tenantId:"b"},{name:"Outra oficina",document:"12345678000195"});
  await saveSupplier(db,ctx,{name:"Nome corrigido",document:"12345678000195",seller:"João",notes:"Pagamento em 30 dias",active:0},id);
  const list=await listSuppliers(db,ctx);
  assert.equal(list.length,1);assert.equal(list[0].active,0);assert.equal(list[0].seller,"João");
  await assert.rejects(()=>saveSupplier(db,{...ctx,tenantId:"b"},{name:"Ataque"},id),/não encontrado/);
  await assert.rejects(()=>supplierDetails(db,{...ctx,tenantId:"b"},id),/não encontrado/);
  await assert.rejects(()=>saveSupplier(db,{...ctx,role:"operator"},{name:"Negado"}),/administrador/);
  await assert.rejects(()=>saveSupplier(db,ctx,{name:"Inválido",document:"CNPJ errado"}));
  await assert.rejects(()=>saveSupplier(db,ctx,{name:"Inválido",email:"email-inválido"}));
  assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE action='supplier.updated'").get()!.n,1);
 } finally {db.close();}
});
test("invoice supplier preview is read only, confirmation preserves edited contacts and failed imports roll back suppliers",async()=>{
 const db=fixture();
 try {
  const preview=await previewStockInvoice(db,ctx,xml());
  assert.equal(preview.supplier_record.existing,false);assert.equal(preview.supplier_record.draft.address,"Rua Um");
  assert.equal(preview.supplier_record.draft.name,"Fornecedor & Cia");
  assert.equal(db.prepare("SELECT count(*) n FROM suppliers").get()!.n,0);
  await assert.rejects(()=>importStockInvoice(db,ctx,xml(),[{...choices[0],catalog_id:"foreign"}]),/não encontrado/);
  assert.equal(db.prepare("SELECT count(*) n FROM suppliers").get()!.n,0);
  await assert.rejects(()=>importStockInvoice(db,ctx,xml(),choices,{...preview.supplier_record.draft,document:"55847057000970"}),/CNPJ/);
  const result=await importStockInvoice(db,ctx,xml(),choices,{...preview.supplier_record.draft,seller:"Maria",notes:"Entrega combinada"});
  const supplier=(await listSuppliers(db,ctx))[0];
  assert.equal(result.supplier_id,supplier.id);assert.equal(supplier.seller,"Maria");assert.equal(supplier.product_count,1);
  const detail=await supplierDetails(db,ctx,supplier.id);
  assert.equal(detail.products[0].supplier_code,"00001");assert.equal(detail.products[0].last_cost,2200);
  await saveSupplier(db,ctx,{...supplier,name:"Nome editado",phone:"43 3333-3333"},supplier.id);
  const next=await previewStockInvoice(db,ctx,xml(2));
  assert.equal(next.supplier_record.existing,true);assert.equal(next.supplier_record.draft.phone,"43 3333-3333");
  await importStockInvoice(db,ctx,xml(2),choices);
  assert.equal((await listSuppliers(db,ctx))[0].name,"Nome editado");
  assert.equal(db.prepare("SELECT supplier_name FROM stock_invoices WHERE invoice_number='1'").get()!.supplier_name,"Fornecedor & Cia");
  await importStockInvoice(db,ctx,xml(),choices,{...preview.supplier_record.draft,name:"Duplicada não edita"});
  assert.equal((await listSuppliers(db,ctx))[0].name,"Nome editado");
 }finally{db.close();}
});
test("one product links to several suppliers without changing its brand and older invoices do not replace latest supplier cost",async()=>{
 const db=fixture();
 try {
  await importStockInvoice(db,ctx,xml(),choices);
  await importStockInvoice(db,ctx,xml(2,"55847057000970","60.00"),choices);
  await importStockInvoice(db,ctx,xml(3,"12345678000195","10.00","2026-10-01"),choices);
  const list=await listSuppliers(db,ctx);assert.equal(list.length,2);
  for(const s of list)assert.equal(s.product_count,1);
  const first=list.find(s=>s.document==="12345678000195")!;
  const detail=await supplierDetails(db,ctx,first.id);
  assert.equal(detail.products[0].last_cost,2200);assert.equal(detail.products[0].last_purchase_on,"2026-10-11");
  assert.equal(detail.products[0].brand,"Marca própria");
  await saveSupplier(db,ctx,{...first,active:0},first.id);
  assert.equal((await supplierDetails(db,ctx,first.id)).products.length,1);
  assert.equal(db.prepare("SELECT count(*) n FROM stock_invoices WHERE supplier_id=?").get(first.id)!.n,2);
  assert.match(postgresSql("SELECT * FROM suppliers WHERE tenant_id=?"),/horse_power.suppliers/);
 }finally{db.close();}
});
test("supplier HTTP routes require login and owner role and refuse editing another workshop",async()=>{
 const db=fixture();
 const id=await saveSupplier(db,{...ctx,tenantId:"b"},{name:"Privado"});
 db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(digest("owner"),"u","a",Date.now()+60000);
 db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(digest("operator"),"m","a",Date.now()+60000);
 const server=createApp(db).listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
 try {
  assert.equal((await fetch(base+"/suppliers")).status,401);
  assert.equal((await fetch(base+"/suppliers",{headers:{Cookie:"hp_session=operator"}})).status,403);
  const created=await fetch(base+"/suppliers",{method:"POST",headers:{Cookie:"hp_session=owner","Content-Type":"application/json"},body:JSON.stringify({name:"HTTP"})});
  assert.equal(created.status,201);const saved=await created.json();
  const changed=await fetch(base+"/suppliers/"+saved.id,{method:"PUT",headers:{Cookie:"hp_session=owner","Content-Type":"application/json"},body:JSON.stringify({name:"HTTP editado",active:0})});
  assert.equal(changed.status,200);
  assert.equal((await fetch(base+"/suppliers/"+id,{method:"PUT",headers:{Cookie:"hp_session=owner","Content-Type":"application/json"},body:JSON.stringify({name:"Negado"})})).status,404);
  const list=await (await fetch(base+"/suppliers",{headers:{Cookie:"hp_session=owner"}})).json();
  assert.equal(list.length,1);assert.equal(list[0].name,"HTTP editado");
  const workspace=await(await fetch(base+"/workspace",{headers:{Cookie:"hp_session=operator"}})).json();
  assert.equal(workspace.suppliers,undefined);
 }finally{await new Promise<void>(r=>server.close(()=>r()));db.close();}
});

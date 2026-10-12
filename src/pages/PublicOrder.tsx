import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { type Entity } from "../lib/types";
import { OrderPrint } from "../components/OrderPrint";
export function PublicOrder() {
 const {token}=useParams();
 const [data,setData]=useState<Entity|null>(null),[error,setError]=useState("");
 useEffect(()=>{
  let current=true;setData(null);setError("");
  api("/public/"+token).then(d=>{if(current)setData(d);}).catch(e=>{if(current)setError(e.message);});
  return()=>{current=false;};
 },[token]);
 return <main className="customer-document-page">
  {error ? <section className="panel"><h1>{error}</h1><p>Peça um novo link à oficina.</p></section> :
   !data ? <p role="status">Carregando atendimento…</p> : <>
    <div className="customer-document-actions no-print"><button className="button" onClick={()=>window.print()}>Imprimir / salvar PDF</button></div>
    <OrderPrint publicView tenant={data.shop} customer={{id:"public",name:data.customer}} order={{...data,id:"public",guest_vehicle:data.vehicle,guest_plate:data.plate,items:data.items.map((i:Entity,n:number)=>({...i,id:String(n)}))}} />
    <p className="customer-document-terms">Condições de pagamento e eventuais acréscimos de cartão são combinados com a oficina.</p>
   </>}
 </main>;
}

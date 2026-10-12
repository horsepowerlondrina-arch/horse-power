import { useState, type FormEvent } from "react";
import { useApp } from "../lib/context";
import { send } from "../lib/api";
import { workshopIdentity, type WorkshopIdentity } from "../../shared/workshopIdentity";
import { DocumentHeader } from "./DocumentHeader";
import { Field, Submit } from "./ui";
async function logoFromFile(file:File) {
 if(!["image/png","image/jpeg","image/webp"].includes(file.type) || file.size>5*1024*1024)
   throw new Error("Selecione PNG, JPG ou WebP de até 5 MB.");
 const url=URL.createObjectURL(file);
 try {
  const image=new Image();image.src=url;
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Não foi possível ler a imagem."));});
  const canvas=document.createElement("canvas"),context=canvas.getContext("2d");
  if(!context)throw new Error("Não foi possível preparar o logotipo.");
  let size=Math.min(900,Math.max(image.naturalWidth,image.naturalHeight));
  for(let attempt=0;attempt<10;attempt++){
   const scale=size/Math.max(image.naturalWidth,image.naturalHeight);
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));
   if(blob && blob.size<=200*1024) return await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Não foi possível preparar o logotipo."));reader.readAsDataURL(blob);
   });
   size=Math.floor(size*0.8);
  }
  throw new Error("A imagem é muito detalhada. Selecione um logotipo menor.");
 }finally{URL.revokeObjectURL(url);}
}
export function WorkshopProfile() {
 const {session,refreshSession,notify}=useApp();
 const [draft,setDraft]=useState<WorkshopIdentity>(()=>workshopIdentity(session.tenant));
 const [busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState("");
 const fields:{key:keyof WorkshopIdentity;label:string;max:number;full?:boolean;type?:string}[]=[
 {key:"name",label:"Nome da oficina *",max:150},{key:"legal_name",label:"Razão social",max:200},
 {key:"document",label:"CPF / CNPJ",max:30},{key:"phone",label:"Telefone / WhatsApp",max:80,type:"tel"},
 {key:"email",label:"E-mail",max:200,type:"email"},{key:"city",label:"Cidade",max:100},
 {key:"state",label:"UF",max:2},{key:"address",label:"Endereço completo",max:300,full:true}
 ];
 async function save(e:FormEvent) {
  e.preventDefault();if(busy||uploading)return;setBusy(true);setError("");
  try {const saved=await send("/workshop-profile",{...draft,tenant_id:session.tenant.id},"PUT");setDraft(saved);await refreshSession();notify("Dados e logotipo da oficina salvos.");}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <form className="panel work-order-section workshop-profile-form" onSubmit={save}>
  <h2>Dados da oficina</h2><p className="muted">Usados nas OS, orçamentos, checklists e páginas compartilhadas com clientes. Os documentos emitidos novamente usarão os dados atuais.</p>
  <div className="form-grid">{fields.map(f=><Field key={f.key} label={f.label} full={f.full}>
   <input type={f.type || "text"} maxLength={f.max} required={f.key==="name"} value={draft[f.key]} disabled={busy}
    onChange={e=>setDraft(v=>({...v,[f.key]:e.target.value}))} />
  </Field>)}
   <Field label="Logotipo dos documentos (PNG, JPG ou WebP · até 5 MB)" full>
    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||uploading} onChange={async e=>{
     const file=e.target.files?.[0];e.target.value="";if(!file)return;
     setUploading(true);setError("");
     try {const logo=await logoFromFile(file);setDraft(v=>({...v,document_logo:logo}));}
     catch(e){setError((e as Error).message);}finally{setUploading(false);}
    }} />
   </Field>
  </div>
  {draft.document_logo && <button type="button" className="button" disabled={busy||uploading} onClick={()=>setDraft(v=>({...v,document_logo:""}))}>Remover logotipo</button>}
  <p className="muted">Prévia do cabeçalho</p><div className="workshop-profile-preview"><DocumentHeader shop={draft} /></div>
  {uploading && <p role="status">Preparando logotipo…</p>}
  {error&&<p className="error-box" role="alert">{error}</p>}
  <div className="capture-actions"><Submit busy={busy||uploading}>Salvar dados da oficina</Submit></div>
 </form>;
}

import { z } from "zod";
import { inflateSync } from "node:zlib";
import { transaction, type DB } from "../db/database.js";
import type { Context } from "../auth/session.js";
import { requireAdmin } from "./payments.js";
import { audit } from "./workshop.js";
import { workshopIdentity } from "../../shared/workshopIdentity.js";
export const MAX_LOGO_BYTES=200*1024;
function crc32(bytes:Buffer) {
 let crc=0xffffffff;
 for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 return (crc^0xffffffff)>>>0;
}
export function validDocumentLogo(value:string) {
 if(!value || value==="/brand/icon.jpg")return true;
 if(!value.startsWith("data:image/png;base64,"))return false;
 const raw=value.slice(22);
 if(raw.length>Math.ceil(MAX_LOGO_BYTES/3)*4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw))return false;
 try {
  const bytes=Buffer.from(raw,"base64");
  if(bytes.length>MAX_LOGO_BYTES || bytes.toString("base64")!==raw || bytes.length<57 ||
    bytes.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")return false;
  let offset=8,width=0,height=0,channels=0,ended=false;
  const data:Buffer[]=[];
  while(offset<bytes.length){
   if(offset+12>bytes.length)return false;
   const length=bytes.readUInt32BE(offset),end=offset+12+length;
   if(end>bytes.length)return false;
   const type=bytes.toString("ascii",offset+4,offset+8);
   if(crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))return false;
   if(offset===8 && type!=="IHDR")return false;
   if(type==="IHDR"){
    if(offset!==8 || length!==13)return false;
    width=bytes.readUInt32BE(offset+8);height=bytes.readUInt32BE(offset+12);
    channels=({0:1,2:3,4:2,6:4} as Record<number,number>)[bytes[offset+17]] || 0;
    if(!width || !height || width>1200 || height>1200 || !channels ||
      bytes[offset+16]!==8 || bytes[offset+18]!==0 || bytes[offset+19]!==0 || bytes[offset+20]!==0)return false;
   }else if(type==="IDAT"){data.push(bytes.subarray(offset+8,end-4));}
   else if(type==="IEND"){if(length!==0 || end!==bytes.length)return false;ended=true;}
   offset=end;
  }
  if(!ended || !data.length)return false;
  const stride=width*channels+1,decoded=inflateSync(Buffer.concat(data),{maxOutputLength:stride*height});
  if(decoded.length!==stride*height)return false;
  for(let y=0;y<height;y++)if(decoded[y*stride]>4)return false;
  return true;
 }catch{return false;}
}
const text=(max:number)=>z.string().trim().max(max).default("");
export const workshopProfileSchema=z.object({
 name:z.string().trim().min(1,"Informe o nome da oficina.").max(150),
 legal_name:text(200),document:text(30).refine(v=>/^[\d.\s/\-]*$/.test(v),"Informe apenas CPF ou CNPJ.")
   .transform(v=>v.replace(/\D/g,"")).refine(v=>!v || v.length===11 || v.length===14,"Informe um CPF ou CNPJ completo."),
 phone:text(80),email:text(200).refine(v=>!v || z.string().email().safeParse(v).success,"Informe um e-mail válido."),
 address:text(300),city:text(100),state:text(2).transform(v=>v.toUpperCase())
   .refine(v=>!v || /^[A-Z]{2}$/.test(v),"Informe a UF com duas letras."),
 document_logo:z.string().max(280000).default("").refine(validDocumentLogo,"Logotipo inválido. Selecione novamente uma imagem PNG, JPG ou WebP."),
});
export async function getWorkshopProfile(db:DB,ctx:Context) {
 requireAdmin(ctx);
 const tenant=await db.prepare("SELECT name,legal_name,document,phone,email,address,city,state,document_logo FROM tenants WHERE id=?").get(ctx.tenantId);
 if(!tenant)throw Object.assign(new Error("Oficina não encontrada."),{status:404});
 return workshopIdentity(tenant);
}
export async function saveWorkshopProfile(db:DB,ctx:Context,input:unknown) {
 requireAdmin(ctx);
 const expected=z.object({tenant_id:z.string().optional()}).parse(input).tenant_id;
 if(expected && expected!==ctx.tenantId)throw new Error("A oficina selecionada mudou. Reabra os dados da oficina antes de salvar.");
 const value=workshopProfileSchema.parse(input);
 return transaction(db,async()=>{
  await getWorkshopProfile(db,ctx);
  await db.prepare("UPDATE tenants SET name=?,legal_name=?,document=?,phone=?,email=?,address=?,city=?,state=?,document_logo=? WHERE id=?")
    .run(value.name,value.legal_name,value.document,value.phone,value.email,value.address,value.city,value.state,value.document_logo,ctx.tenantId);
  await audit(db,ctx,"workshop_profile.updated",ctx.tenantId);
  return value;
 });
}

export type WorkshopIdentity = {
 name: string; legal_name: string; document: string; phone: string; email: string;
 address: string; city: string; state: string; document_logo: string;
};
export function workshopIdentity(value: Record<string, unknown>): WorkshopIdentity {
 const text=(key:string)=>typeof value[key]==="string" ? String(value[key]) : "";
 return {name:text("name"),legal_name:text("legal_name"),document:text("document"),phone:text("phone"),
 email:text("email"),address:text("address"),city:text("city"),state:text("state"),document_logo:text("document_logo")};
}
export function formatWorkshopDocument(value: string) {
 const digits=value.replace(/\D/g,"");
 if(digits.length===14)return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,"$1.$2.$3/$4-$5");
 if(digits.length===11)return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,"$1.$2.$3-$4");
 return value;
}

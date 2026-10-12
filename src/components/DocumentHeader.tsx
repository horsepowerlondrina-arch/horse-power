import { workshopIdentity, formatWorkshopDocument } from "../../shared/workshopIdentity";
export function DocumentHeader({shop}:{shop:Record<string,unknown>}) {
 const identity=workshopIdentity(shop);
 const location=[identity.city,identity.state].filter(Boolean).join(" / ");
 return <header className="document-header">
  {identity.document_logo ? <img className="document-logo" src={identity.document_logo} alt={"Logotipo de "+identity.name} /> :
   <div className="document-monogram" aria-hidden="true">{identity.name.slice(0,2).toUpperCase()}</div>}
  <div className="document-company"><h1>{identity.name}</h1>
   {identity.legal_name && identity.legal_name!==identity.name && <p>{identity.legal_name}</p>}
   {identity.document && <p>CPF/CNPJ: {formatWorkshopDocument(identity.document)}</p>}
   {identity.address && <p>{identity.address}</p>}
   {location && (!identity.city || !identity.address.toLocaleLowerCase("pt-BR").includes(identity.city.toLocaleLowerCase("pt-BR"))) && <p>{location}</p>}
   {identity.email && <p>{identity.email}</p>}
  </div>
  {identity.phone && <div className="document-contact"><small>Telefone / WhatsApp</small><strong>{identity.phone}</strong></div>}
 </header>;
}

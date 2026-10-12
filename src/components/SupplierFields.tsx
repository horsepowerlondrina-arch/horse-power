import { Field } from "./ui";
export type SupplierDraft = {
  name: string; trade_name: string; document: string; phone: string; email: string;
  address: string; number: string; complement: string; district: string; city: string;
  state: string; postal_code: string; seller: string; notes: string; active: number;
};
export const blankSupplier = (): SupplierDraft => ({
  name:"",trade_name:"",document:"",phone:"",email:"",address:"",number:"",complement:"",
  district:"",city:"",state:"",postal_code:"",seller:"",notes:"",active:1,
});
export function SupplierFields({ value, onChange, documentReadOnly = false, disabled = false }: {
  value: SupplierDraft; onChange: (value: SupplierDraft) => void; documentReadOnly?: boolean; disabled?: boolean;
}) {
  const fields: {key: keyof Omit<SupplierDraft,"active"|"notes">; label:string; max:number; type?:string; full?:boolean}[] = [
    {key:"name",label:"Nome / razão social *",max:200,full:true},
    {key:"trade_name",label:"Nome fantasia",max:200},
    {key:"document",label:"CPF ou CNPJ",max:30},
    {key:"phone",label:"Telefone / WhatsApp",max:40,type:"tel"},
    {key:"email",label:"E-mail",max:200,type:"email"},
    {key:"seller",label:"Contato do vendedor",max:150,full:true},
    {key:"address",label:"Endereço",max:200,full:true},
    {key:"number",label:"Número",max:30},{key:"complement",label:"Complemento",max:100},
    {key:"district",label:"Bairro",max:100},{key:"city",label:"Cidade",max:100},
    {key:"state",label:"UF",max:2},{key:"postal_code",label:"CEP",max:12},
  ];
  return <div className="form-grid">
    {fields.map(f => <Field key={f.key} label={f.label} full={f.full}>
      <input type={f.type || "text"} required={f.key==="name"} maxLength={f.max}
        value={value[f.key] || ""} readOnly={f.key==="document" && documentReadOnly} disabled={disabled}
        onChange={e=>onChange({...value,[f.key]:e.target.value})} />
    </Field>)}
    <Field label="Observações e condições de pagamento" full>
      <textarea value={value.notes} maxLength={2000} disabled={disabled} onChange={e=>onChange({...value,notes:e.target.value})} />
    </Field>
    <Field label="Situação"><select value={value.active} disabled={disabled} onChange={e=>onChange({...value,active:Number(e.target.value)})}>
      <option value={1}>Ativo</option><option value={0}>Inativo</option>
    </select></Field>
  </div>;
}

type Choice={mode:string;catalog_id:string;quantity:number;name:string;cost:number;price:number};
export function invoiceReviewIssues(supplierName:string,choices:ReadonlyArray<Choice>){
 const issues:{index:number|null;message:string}[]=[];
 if(!supplierName.trim())issues.push({index:null,message:'Informe o nome do fornecedor.'});
 if(!choices.length)issues.push({index:null,message:'Selecione uma nota com produtos para registrar a entrada.'});
 choices.forEach((c,index)=>{
  if(!['new','existing'].includes(c.mode))issues.push({index,message:'Escolha se o item é um produto já cadastrado ou um novo produto.'});
  if(!Number.isInteger(c.quantity)||c.quantity<1||c.quantity>1000000)issues.push({index,message:'Informe a quantidade em unidades inteiras, de 1 a 1.000.000. Confira caixas e embalagens.'});
  if(c.mode==='existing'&&!c.catalog_id)issues.push({index,message:'Selecione o produto que receberá a entrada nos resultados da pesquisa.'});
  if(c.mode==='new'){
   if(!c.name.trim()||c.name.trim().length>300)issues.push({index,message:'Informe a descrição do novo produto, com até 300 caracteres.'});
   if(!Number.isSafeInteger(c.cost)||c.cost<0||c.cost>100000000)issues.push({index,message:'Confira o custo unitário do produto.'});
   if(!Number.isSafeInteger(c.price)||c.price<0||c.price>100000000)issues.push({index,message:'Confira o preço de venda unitário do produto.'});
  }
 });
 return issues;
}

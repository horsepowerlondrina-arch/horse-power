import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceReviewIssues} from '../shared/invoiceReview';
const valid={mode:'new',catalog_id:'',quantity:2,name:'Filtro de óleo',cost:1000,price:1600};
test('invoice confirmation identifies hidden review, quantity and selection blockers by item without weakening validation',()=>{
 assert.deepEqual(invoiceReviewIssues('Fornecedor',[valid,{...valid,mode:'existing',catalog_id:'p'}]),[]);
 const issues=invoiceReviewIssues('Fornecedor',[valid,{...valid,mode:'review'},{...valid,quantity:1.5},{...valid,mode:'existing',catalog_id:''}]);
 assert.deepEqual(issues.map(i=>i.index),[1,2,3]);
 assert.match(issues[0].message,/Escolha/);assert.match(issues[1].message,/inteiras/);assert.match(issues[2].message,/resultados/);
 assert.equal(invoiceReviewIssues('',[valid])[0].index,null);
 assert.ok(invoiceReviewIssues('Fornecedor',[{...valid,name:'',cost:NaN,price:-1}]).length===3);
 assert.deepEqual(invoiceReviewIssues('Fornecedor',[{...valid,quantity:1}]),[]);
});

"""Read-only source extraction. Run with bundled Python after PDFs are extracted to tmp/import."""
from pathlib import Path
import re,json,unicodedata
P=Path('tmp/import')
def cents(s): return round(float(s.replace('.','').replace(',','.'))*100)
def norm(s):return ' '.join(unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower().split())
def take(t,p,default=''):
 m=re.search(p,t,re.M); return m.group(1).strip() if m else default
def date(s): return '-'.join(s.split('/')[::-1])
customers=[]
for line in (P/'Clientes.txt').read_text().splitlines():
 m=re.match(r'^\s*(\d+)\s+(.+?)\s{2,}(.*)$',line)
 if m:
  rest=m[3].strip(); phone=take(rest,r'([\d ()-]{8,})')
  customers.append(dict(source_id=m[1],name=m[2].strip(),phone=phone,source_details=rest))
vehicles=[]
for line in next(P.glob('Ve*.txt')).read_text().splitlines():
 if not re.match(r'^\s*[A-Z]{3}-?\d[A-Z0-9]\d{2}\s',line):continue
 cols=re.split(r'\s{2,}',line.strip())
 yi=next((i for i,c in enumerate(cols) if re.match(r'^\d{4}(?: |$)',c)),None)
 if yi is None: raise ValueError(cols)
 plate=cols[0];model=' '.join(cols[1:yi-1]);color=cols[yi-1];year=cols[yi];owner=' '.join(cols[yi+1:])
 vehicles.append(dict(plate=plate.replace('-',''),description=model,color=color,year=int(take(year,r'(\d{4})','0')),owner=owner.split('(')[0].strip(),phone=take(owner,r'\(([^)]+)')))
profits={}
for line in next(P.glob('Rel*lucro*.txt')).read_text().splitlines():
 m=re.match(r'OS Num\. (\d+)',line)
 if m: profits[int(m[1])]=[cents(s) for s in re.findall(r'R\$\s*(-?[\d.]+,\d{2})',line)]
orders=[];issues=[]
for p in sorted(P.glob('OS *.txt')):
 t=p.read_text(); num=int(take(t,r'ORDEM DE SERVIÇO Nº\s*(\d+)'))
 its=[]
 for kind,start,end in [('service','SERVIÇOS:','TOTAL SERVIÇOS:'),('product','PRODUTOS:','TOTAL PRODUTOS:')]:
  mseg=re.search(r'^'+start+r'\s*\n([\s\S]*?)'+end,t,re.M)
  segment=mseg[1] if mseg else ''
  for l in segment.splitlines():
   if 'R$' not in l:continue
   if kind=='service':
    m=re.match(r'\s*(.*?)\s*R\$\s*([\d.]+,\d{2})\s*$',l)
    if m: its.append(dict(kind=kind,name=m[1].strip(),price=cents(m[2]),quantity=1))
    else:issues.append([num,'linha serviço',l])
   else:
    m=re.match(r'\s*(.*?)\s*R\$\s*([\d.]+,\d{2})\s+([\d.,]+)\s+R\$\s*([\d.]+,\d{2})\s*$',l)
    if m: its.append(dict(kind=kind,name=m[1].strip(),price=cents(m[2]),quantity=float(m[3].replace(',','.')),line_total=cents(m[4])))
    else:issues.append([num,'linha produto',l])
 total=cents(take(t,r'TOTAL A PAGAR:\s*R\$\s*([\d.]+,\d{2})','0,00'))
 discount=cents(take(t,r'DESCONTO:\s*R\$\s*([\d.]+,\d{2})','0,00'))
 calculated=sum(round(i['price']*i['quantity']) for i in its)-discount
 if calculated!=total:issues.append([num,'total',calculated,total])
 orders.append(dict(number=num,customer=take(t,r'Cliente:\s*(.+)'),phone=take(t,r'Telefones:\s*(.*?)\s*Docs:'),document=take(t,r'Docs:[ \t]*(.*)'),address=take(t,r'Endereço:[ \t]*(.*)'),plate=take(t,r'Placa:\s*([A-Z0-9-]+)').replace('-',''),vehicle=take(t,r'Veículo:\s*(.*?)\s*Placa:'),km=int(take(t,r'KM:\s*(\d+)','0')),chassis=take(t,r'Chassi:[ \t]*(.*)'),problem=take(t,r'DESCRIÇÃO DO PROBLEMA:\s*([\s\S]*?)(?:SERVIÇOS:|PRODUTOS:|FORMA DE PAGAMENTO:)'),notes=take(t,r'OBSERVAÇÕES:\s*([\s\S]*?)DATA ENTRADA:'),payment=take(t,r'FORMA DE PAGAMENTO:\s*([\s\S]*?)(?:OBSERVAÇÕES:|DATA ENTRADA:)'),entered_on=date(take(t,r'DATA ENTRADA:\s*(\d+/\d+/\d+)')),completed_on=date(take(t,r'DATA FINALIZAÇÃO:\s*(\d+/\d+/\d+)')),total=total,discount=discount,items=its,profit=profits.get(num),source=str(p)))
# Check the independent general report, excluding repeated page totals.
report={}
for line in next(P.glob('Rel*Geral*.txt')).read_text().splitlines():
 m=re.match(r'\s*(\d+)\s+\d{2}/\d{2}/\d{4}.*R\$\s*([\d.]+,\d{2})\s+(\S+)',line)
 if m:report[int(m[1])]=cents(m[2])
for o in orders:
 if o['number'] in report and o['total']!=report[o['number']]:issues.append([o['number'],'report mismatch',o['total'],report[o['number']]])
result=dict(customers=customers,vehicles=vehicles,orders=orders,issues=issues,report=report)
(P/'legacy.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(dict(customers=len(customers),vehicles=len(vehicles),orders=len(orders),report=len(report),total=sum(o['total'] for o in orders),missing_pdfs=sorted(set(report)-{o['number'] for o in orders}),issues=issues),ensure_ascii=False))

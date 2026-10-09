import { readFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function compareVersions(a, b) {
  const left=a.split(".").map(Number), right=b.split(".").map(Number);
  for(let i=0;i<4;i++){const delta=(left[i]||0)-(right[i]||0);if(delta)return Math.sign(delta);}
  return 0;
}
export async function publishExtension({token,publisherId,itemId,version,zip,request=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms))}) {
  if(!token || !publisherId || !/^[a-p]{32}$/.test(itemId)) throw new Error("Configure CWS_PUBLISHER_ID e autenticação da conta de serviço.");
  const name="publishers/"+encodeURIComponent(publisherId)+"/items/"+itemId;
  const url="https://chromewebstore.googleapis.com/v2/"+name;
  async function api(endpoint,options={}) {
    const response=await request(endpoint,{...options,headers:{Authorization:"Bearer "+token,...options.headers},signal:AbortSignal.timeout(60000)});
    const data=await response.json();
    if(!response.ok)throw new Error("Chrome Web Store HTTP "+response.status+": "+JSON.stringify(data.error||data));
    return data;
  }
  let status=await api(url+":fetchStatus");
  if(status.takenDown)throw new Error("Item removido pela loja; consulte o painel.");
  const published=status.publishedItemRevisionStatus?.distributionChannels||[];
  if(published.some(c=>compareVersions(c.crxVersion,version)>=0))return "Versão "+version+" já publicada; nenhum envio.";
  if(status.submittedItemRevisionStatus)throw new Error("Existe uma submissão na loja. Confira o painel antes de enviar outra versão.");
  let upload=await api("https://chromewebstore.googleapis.com/upload/v2/"+name+":upload",{method:"POST",headers:{"Content-Type":"application/zip"},body:zip});
  let state=upload.uploadState;
  for(let i=0;state==="IN_PROGRESS" && i<30;i++){
    await pause(2000);
    status=await api(url+":fetchStatus");
    state=status.lastAsyncUploadState;
  }
  if(state!=="SUCCEEDED")throw new Error("Upload não concluído: "+state);
  const result=await api(url+":publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({publishType:"DEFAULT_PUBLISH"})});
  return "Versão "+version+" enviada. Estado na loja: "+result.state+". A publicação depende da aprovação do Google.";
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const manifest=JSON.parse(readFileSync("extension/horse-power/manifest.json","utf8"));
    const message=await publishExtension({token:process.env.CWS_ACCESS_TOKEN,publisherId:process.env.CWS_PUBLISHER_ID,itemId:"ddmnjpmldgnjefjkachlpicngaphlobf",version:manifest.version,zip:readFileSync("public/downloads/horse-power-conector.zip")});
    console.log(message);
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,message+"\n");
  } catch(error) {console.error(error.message);process.exitCode=1;}
}

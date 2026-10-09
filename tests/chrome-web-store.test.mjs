import test from "node:test";
import assert from "node:assert/strict";
import { compareVersions,publishExtension } from "../scripts/publish-extension.mjs";
const base={token:"test-token",publisherId:"publisher",itemId:"ddmnjpmldgnjefjkachlpicngaphlobf",version:"1.4.0",zip:Buffer.from("zip"),pause:async()=>{}};
function mock(responses){const calls=[];return {calls,request:async(url,options)=>{calls.push({url,options});const data=responses.shift();if(!data)throw Error("Unexpected request");return {ok:true,json:async()=>data};}};}
test("version comparison is numeric",()=>{assert.equal(compareVersions("1.10.0","1.4.0"),1);assert.equal(compareVersions("1.4","1.4.0"),0);});
test("published version is skipped without upload",async()=>{const m=mock([{publishedItemRevisionStatus:{distributionChannels:[{crxVersion:"1.4.0"}]}}]);assert.match(await publishExtension({...base,request:m.request}),/já publicada/);assert.equal(m.calls.length,1);});
test("pending submission is preserved",async()=>{const m=mock([{submittedItemRevisionStatus:{state:"PENDING_REVIEW"}}]);await assert.rejects(publishExtension({...base,request:m.request}),/Existe uma submissão/);assert.equal(m.calls.length,1);});
test("async upload completes before publish using v2",async()=>{const m=mock([{}, {uploadState:"IN_PROGRESS"},{lastAsyncUploadState:"SUCCEEDED"},{state:"PENDING_REVIEW"}]);assert.match(await publishExtension({...base,request:m.request}),/PENDING_REVIEW/);assert.match(m.calls[1].url,/upload\/v2\/publishers/);assert.equal(m.calls[3].options.method,"POST");assert.deepEqual(JSON.parse(m.calls[3].options.body),{publishType:"DEFAULT_PUBLISH"});});
test("failed upload never publishes",async()=>{const m=mock([{}, {uploadState:"FAILED"}]);await assert.rejects(publishExtension({...base,request:m.request}),/Upload não concluído/);assert.equal(m.calls.length,2);});
test("authorization failure is reported",async()=>{await assert.rejects(publishExtension({...base,request:async()=>({ok:false,status:403,json:async()=>({error:{message:"Permission denied"}})})}),/HTTP 403/);});

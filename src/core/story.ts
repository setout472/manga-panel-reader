import {wireRequest,normalizeWireResponse,transportIdentity,type WireOptions} from './wire';
import {createHash} from 'node:crypto';
import type {PageAsset,Panel} from '../shared/types';
import type {PanelFact,PageContent,PanelRef,StoryDraft,StoryScene,NarrationBlock} from '../shared/story';
import {ApiError} from './inference';
import {validatePanels} from './panels';
import {reviewKey,validateReview,type PageReviewInput} from './review';
import {ocrEvidencePayload,type OcrDocument} from './ocr';

import {FACT_PROMPT,STORY_PROMPT,PROMPT_VERSION,REVIEW_PROMPT,OCR_PROMPT} from './prompts';
export const STORY_VERSION=PROMPT_VERSION;
const invalid=()=>new ApiError('内容结构或来源引用无效，需人工复核');
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const refKey=(ref:PanelRef)=>JSON.stringify([ref.pageId,ref.panelId]);
function str(value:unknown,max=2000):string {if(typeof value!=='string'||!value.trim()||value.length>max)throw invalid();return value.trim()}
function list(value:unknown,max:number):unknown[]{if(!Array.isArray(value)||value.length>max)throw invalid();return value}
function strings(value:unknown,max=30,length=300):string[]{return list(value,max).map(v=>str(v,length))}
function obj(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();return value as Record<string,unknown>}
function effectivePanels(page:PageAsset):Panel[]{const panels=page.override?.panels??page.analysis?.panels;if(!panels?.length)return [{id:'whole-page',x:0,y:0,width:1,height:1,order:1}];return validatePanels(panels)}
export function contentKey(page:PageAsset,model:string,baseUrl:string,maxImageSide:number,options:WireOptions={}):string{return hash([STORY_VERSION,page.id,page.hash,page.width,page.height,effectivePanels(page),page.override?.version??null,model,transportIdentity(baseUrl,options),maxImageSide])}
export function storyKey(contents:PageContent[],model:string,baseUrl:string,options:WireOptions={}):string{return hash([STORY_VERSION,contents.map(c=>[c.pageId,c.sourceKey,c.panels,c.summary,c.needsReview]),model,transportIdentity(baseUrl,options)])}
type Transport=WireOptions & {baseUrl:string;model:string;apiKey:string;signal?:AbortSignal};
export type PageContentInput=Transport & {page:PageAsset;image:Uint8Array;mime:string;context:string;maxImageSide:number;review?:PageReviewInput;ocrEvidence?:OcrDocument};
export type StoryDraftInput=Transport & {contents:PageContent[]};
function endpoint(value:string):string {
 let url:URL;try{url=new URL(value)}catch{throw new ApiError('模型服务地址无效')}
 if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new ApiError('模型服务须使用 HTTPS 或明确的本机 HTTP 地址');
 return url.href.replace(/\/$/,'')+'/chat/completions';
}
async function delay(ms:number,signal?:AbortSignal){signal?.throwIfAborted();await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason??new Error('请求已取消'))};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},ms);signal?.addEventListener('abort',abort,{once:true})})}
async function boundedJson(res:Response,signal:AbortSignal):Promise<Record<string,unknown>>{
 if(!res.body)throw invalid();const reader=res.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 const abort=()=>{void reader.cancel().catch(()=>{})};signal.addEventListener('abort',abort,{once:true});
 try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();signal.throwIfAborted();if(done)break;size+=value.length;if(size>300_000){await reader.cancel();throw invalid()}chunks.push(value)}return obj(JSON.parse(Buffer.concat(chunks).toString('utf8')))}finally{signal.removeEventListener('abort',abort);reader.releaseLock()}
}
export async function requestStoryJson(input:Transport,messages:unknown[],fetcher:typeof fetch,schema?:Record<string,unknown>):Promise<{data:Record<string,unknown>;usage?:PageContent['usage']}>{
 const legacyUrl=endpoint(input.baseUrl);str(input.model,200);
 const request=wireRequest(input.baseUrl,input,{model:input.model,response_format:legacyUrl.startsWith('http:')&&schema?{type:'json_schema',json_schema:{name:'manga',strict:true,schema}}:{type:'json_object'},...(legacyUrl.startsWith('http:')?{repeat_penalty:1.15}:{}),temperature:0.2,max_tokens:legacyUrl.startsWith('http:')?4096:8192,messages});
 const url=request.url,body=request.body;
 for(let attempt=0;attempt<3;attempt++){
  input.signal?.throwIfAborted();const signal=input.signal?AbortSignal.any([input.signal,AbortSignal.timeout(url.startsWith('http:')||input.wireApi==='responses'?300_000:90_000)]):AbortSignal.timeout(url.startsWith('http:')||input.wireApi==='responses'?300_000:90_000);
  let res:Response;try{res=await fetcher(url,{method:'POST',headers:{Authorization:`Bearer ${input.apiKey}`,'Content-Type':'application/json'},body,signal,redirect:'error'})}catch{input.signal?.throwIfAborted();if(attempt<2&&!url.startsWith('http:')&&input.wireApi!=='responses'){await delay(250*2**attempt,input.signal);continue}throw new ApiError('网络连接或请求超时，请稍后重试')}
  if(!res.ok){await res.body?.cancel();if([401,402,403].includes(res.status))throw new ApiError(`API ${res.status}：请检查密钥、权限或余额`,true);if((res.status===429||res.status>=500)&&attempt<2&&input.wireApi!=='responses'){await delay(250*2**attempt,input.signal);continue}throw new ApiError(`API HTTP ${res.status}，内容未完成`)}
  try{const result=normalizeWireResponse(await boundedJson(res,signal),input);const choices=list(result.choices,10);if(obj(choices[0]).finish_reason==='length')throw invalid();const message=obj(obj(choices[0]).message);const content=str(message.content,150_000);const data=obj(JSON.parse(content));const usage:PageContent['usage']={};if(result.usage&&typeof result.usage==='object'){const source=obj(result.usage);for(const key of ['prompt_tokens','completion_tokens','total_tokens'] as const){const value=source[key];if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)usage[key]=value}}return {data,usage:Object.keys(usage).length?usage:undefined}}catch{input.signal?.throwIfAborted();throw new ApiError('模型 JSON 无效、超限或被截断，需人工复核')}
 }
 throw new ApiError('请求未完成');
}

const textSchema=(maxLength=600)=>({type:'string',minLength:1,maxLength});
const arraySchema=(items:unknown,maxItems=8,minItems=0)=>({type:'array',items,minItems,maxItems});
const objectSchema=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
function factsSchema(panels:Panel[]){return objectSchema({panels:{type:'array',minItems:panels.length,maxItems:panels.length,prefixItems:panels.map(p=>objectSchema({panelId:{const:p.id},characters:arraySchema(textSchema(60),6),dialogue:arraySchema(objectSchema({speaker:textSchema(60),text:textSchema(400)}),12),description:textSchema(300),uncertainties:arraySchema(textSchema(120),4)}))},summary:textSchema(500),needsReview:{type:'boolean'}})}
function draftSchema(contents:PageContent[]){const ref={anyOf:contents.flatMap(c=>c.panels.map(p=>objectSchema({pageId:{const:c.pageId},panelId:{const:p.panelId}})))};const refs=arraySchema(ref,contents.reduce((n,c)=>n+c.panels.length,0),1);const names=[...new Set(contents.flatMap(c=>c.panels.flatMap(p=>p.characters)))];return objectSchema({title:textSchema(80),scenes:arraySchema(objectSchema({id:textSchema(40),title:textSchema(80),summary:textSchema(500),panelRefs:refs,characters:arraySchema(names.length?{enum:names}:textSchema(60),names.length)}),Math.min(contents.length*2,20),1),blocks:arraySchema(objectSchema({id:textSchema(40),sceneId:textSchema(40),text:textSchema(800),panelRefs:refs}),Math.min(contents.length*3,30),1),unresolved:arraySchema(textSchema(150),8)})}


export async function requestPageContent(input:PageContentInput,fetcher:typeof fetch=fetch):Promise<PageContent>{
 const started=Date.now();if(!['image/png','image/jpeg','image/webp'].includes(input.mime)||input.image.length===0||input.image.length>20_000_000||typeof input.context!=='string'||input.context.length>8000||!Number.isFinite(input.maxImageSide)||input.maxImageSide<1)throw invalid();
 const panels=effectivePanels(input.page),reviewCandidate=input.review?validateReview(input.page,input.review):undefined;
 const ocrEvidence=input.ocrEvidence?ocrEvidencePayload(input.page,input.ocrEvidence):undefined;
 const ocrPrompt=OCR_PROMPT;
 const {data,usage}=await requestStoryJson(input,[{role:'system',content:FACT_PROMPT+(reviewCandidate?'\n'+REVIEW_PROMPT:'')+(ocrEvidence?'\n'+ocrPrompt:'')},{role:'user',content:[{type:'text',text:JSON.stringify({pageId:input.page.id,panels,context:input.baseUrl.startsWith('http:')?'':input.context,version:STORY_VERSION,...(reviewCandidate?{reviewCandidate}:{}),...(ocrEvidence?{ocrEvidence}:{})})},{type:'image_url',image_url:{url:`data:${input.mime};base64,${Buffer.from(input.image).toString('base64')}`,detail:'high'}}]}],fetcher,factsSchema(panels));
 const facts=list(data.panels,100).map(value=>{const p=obj(value);return {panelId:str(p.panelId,80),characters:strings(p.characters),dialogue:list(p.dialogue,60).map(d=>{const line=obj(d);return {speaker:str(line.speaker,200),text:str(line.text,2000)}}),description:str(p.description,4000),uncertainties:strings(p.uncertainties)} satisfies PanelFact});
 if(facts.length!==panels.length||new Set(facts.map(p=>p.panelId)).size!==facts.length||facts.some(p=>!panels.some(known=>known.id===p.panelId)))throw invalid();
 facts.sort((a,b)=>panels.findIndex(p=>p.id===a.panelId)-panels.findIndex(p=>p.id===b.panelId));
 const baseKey=input.review?reviewKey(input.page,input.model,transportIdentity(input.baseUrl,input),input.maxImageSide,input.review):contentKey(input.page,input.model,input.baseUrl,input.maxImageSide,input);
 return {pageId:input.page.id,sourceKey:ocrEvidence?hash([baseKey,ocrPrompt,ocrEvidence]):baseKey,panels:facts,summary:str(data.summary,4000),needsReview:!!ocrEvidence||!!input.review||input.baseUrl.startsWith('http:')||input.page.analysis?.needsReview===true||data.needsReview!==false||facts.some(p=>p.uncertainties.length>0),model:input.model,durationMs:Date.now()-started,usage};
}

export async function requestStoryDraft(input:StoryDraftInput,fetcher:typeof fetch=fetch):Promise<StoryDraft>{
 const started=Date.now();if(!input.contents.length||input.contents.length>20||new Set(input.contents.map(c=>c.pageId)).size!==input.contents.length)throw invalid();
 const allowed=new Map<string,number>();for(const content of input.contents){str(content.pageId,80);if(!content.panels.length||content.panels.length>100)throw invalid();for(const p of content.panels){const key=refKey({pageId:content.pageId,panelId:p.panelId});if(allowed.has(key))throw invalid();allowed.set(key,allowed.size)}}
 const facts=JSON.stringify(input.contents.map(c=>({pageId:c.pageId,panels:c.panels,summary:c.summary,needsReview:c.needsReview})));if(facts.length>60_000)throw new ApiError('本段内容过长，请缩小解析页数');
 const {data}=await requestStoryJson(input,[{role:'system',content:STORY_PROMPT},{role:'user',content:facts}],fetcher,draftSchema(input.contents));
 function refs(value:unknown):PanelRef[]{const seen=new Set<string>();let previous=-1;const result=list(value,2000).map(v=>{const r=obj(v);const ref={pageId:str(r.pageId,80),panelId:str(r.panelId,80)};const key=refKey(ref);const order=allowed.get(key);if(order===undefined||seen.has(key)||order<previous)throw invalid();seen.add(key);previous=order;return ref});if(!result.length)throw invalid();return result}
 const scenes:StoryScene[]=list(data.scenes,100).map(v=>{const s=obj(v);return {id:str(s.id,80),title:str(s.title,200),summary:str(s.summary,4000),panelRefs:refs(s.panelRefs),characters:strings(s.characters)}});
 const blocks:NarrationBlock[]=list(data.blocks,200).map(v=>{const b=obj(v);return {id:str(b.id,80),sceneId:str(b.sceneId,80),text:str(b.text,6000),panelRefs:refs(b.panelRefs)}});
 if(!scenes.length||!blocks.length||new Set(scenes.map(s=>s.id)).size!==scenes.length||new Set(blocks.map(b=>b.id)).size!==blocks.length)throw invalid();
 for(const block of blocks){const sentences=block.text.split(/[。！？.!?\n]+/).map(s=>s.trim()).filter(s=>s.length>=12);const counts=new Map<string,number>();for(const sentence of sentences){const count=(counts.get(sentence)||0)+1;if(count>=3)throw new ApiError('解说出现重复循环，需重新生成或更换模型');counts.set(sentence,count)}}
 const represented=new Set(blocks.flatMap(s=>s.panelRefs.map(r=>r.pageId)));if(input.contents.some(c=>!represented.has(c.pageId)))throw new ApiError('解说遗漏所选页面，需重新生成或缩小范围');
 const knownCharacters=new Set(input.contents.flatMap(c=>c.panels.flatMap(p=>p.characters)));if(scenes.some(s=>s.characters.some(name=>!knownCharacters.has(name))))throw invalid();
 const used=new Set<string>();let lastScene=-1;for(const scene of scenes){const first=allowed.get(refKey(scene.panelRefs[0]))!;if(first<lastScene)throw invalid();lastScene=allowed.get(refKey(scene.panelRefs.at(-1)!))!;for(const ref of scene.panelRefs){const key=refKey(ref);if(used.has(key))throw invalid();used.add(key)}if(!blocks.some(b=>b.sceneId===scene.id))throw invalid()}
 let lastBlock=-1;let sceneIndex=-1;for(const block of blocks){const index=scenes.findIndex(s=>s.id===block.sceneId);const scene=scenes[index];if(!scene||index<sceneIndex||block.panelRefs.some(r=>!scene.panelRefs.some(s=>refKey(s)===refKey(r))))throw invalid();const first=allowed.get(refKey(block.panelRefs[0]))!;if(first<lastBlock)throw invalid();lastBlock=allowed.get(refKey(block.panelRefs.at(-1)!))!;sceneIndex=index}
 return {title:str(data.title,200),sourceKey:storyKey(input.contents,input.model,input.baseUrl,input),scopePageIds:input.contents.map(c=>c.pageId),scenes,blocks,unresolved:strings(data.unresolved,100,1000),model:input.model,durationMs:Date.now()-started,updatedAt:new Date().toISOString()};
}

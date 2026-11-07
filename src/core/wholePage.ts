import {createHash} from 'node:crypto';
import {z} from 'zod';
import {ApiError} from './inference';
import {requestStoryJson} from './story';
import {transportIdentity,type WireOptions} from './wire';
import {WHOLE_PAGE_PROMPT,WHOLE_PAGE_VERSION} from './wholePagePrompt';
import {wholePageScopeSchema,wholePageOutputSchema,type WholePageScope,type ValidatedWholePage,type WholePageUnderstanding} from '../shared/wholePage';

type Transport=WireOptions & {baseUrl:string;model:string;apiKey:string;signal?:AbortSignal};
export type WholePageInput=WholePageScope & Transport & {images:{pageId:string;image:Uint8Array;mime:string}[]};
const invalid=()=>new ApiError('整页理解结构或来源引用无效，需复核');
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function unique(values:string[]):boolean{return new Set(values).size===values.length}
function scopeValue(value:WholePageScope):WholePageScope{
 const parsed=wholePageScopeSchema.safeParse(value);if(!parsed.success)throw invalid();const scope=parsed.data;
 if(!unique(scope.pages.map(p=>p.id))||scope.pages.some((p,i)=>i>0&&p.pageNumber<=scope.pages[i-1].pageNumber))throw invalid();
 return scope;
}
export function wholePageKey(value:WholePageScope,config:WireOptions & {baseUrl:string;model:string}):string{
 const scope=scopeValue(value);
 return hash([WHOLE_PAGE_VERSION,WHOLE_PAGE_PROMPT,z.toJSONSchema(wholePageOutputSchema),scope.pages.map(p=>[p.id,p.pageNumber,p.hash,p.width,p.height]),scope.direction,scope.context.version,scope.context.text,scope.maxImageSide,'analysis-jpeg-v1',config.model,transportIdentity(config.baseUrl,config)]);
}
export function validateWholePage(value:unknown,input:WholePageScope):ValidatedWholePage{
 const scope=scopeValue(input),parsed=wholePageOutputSchema.safeParse(value);if(!parsed.success)throw invalid();const data=parsed.data;
 const order=new Map(scope.pages.map((p,i)=>[p.id,i]));
 function pages(ids:string[]){if(!unique(ids)||ids.some((id,i)=>!order.has(id)||(i>0&&order.get(id)!<=order.get(ids[i-1])!)))throw invalid()}
 if(!unique(data.characters.map(c=>c.id))||!unique(data.events.map(e=>e.id))||!unique(data.blocks.map(b=>b.id)))throw invalid();
 const characters=new Set(data.characters.map(c=>c.id)),events=new Map<string,number>();
 for(const c of data.characters)pages(c.pageIds);
 let last=-1;
 for(const event of data.events){
  pages(event.pageIds);const first=order.get(event.pageIds[0])!;
  if(first<last||!unique(event.actors)||event.actors.some(id=>!characters.has(id))||!unique(event.causes)||event.causes.some(id=>!events.has(id)))throw invalid();
  last=first;events.set(event.id,events.size);
 }
 for(const issue of data.unresolved)pages(issue.pageIds);
 const covered=new Set([...data.events,...data.unresolved].flatMap(e=>e.pageIds));if(scope.pages.some(p=>!covered.has(p.id)))throw invalid();
 let blockStart=-1;
 const represented=new Set<string>();
 const blocks=data.blocks.map(block=>{
  if(!unique(block.eventIds)||block.eventIds.some((id,i)=>!events.has(id)||(i>0&&events.get(id)!<=events.get(block.eventIds[i-1])!)))throw invalid();
  const first=events.get(block.eventIds[0])!;if(first<blockStart)throw invalid();blockStart=events.get(block.eventIds.at(-1)!)!;
  const pageSet=new Set(block.eventIds.flatMap(id=>{represented.add(id);return data.events[events.get(id)!].pageIds}));
  return {...block,pageIds:scope.pages.filter(p=>pageSet.has(p.id)).map(p=>p.id)};
 });
 const core=data.unresolved.some(u=>u.severity==='core');
 if(!core&&(!blocks.length||data.events.some(e=>!represented.has(e.id))))throw invalid();
 return {...data,blocks,needsReview:core||data.events.some(e=>e.evidence==='inferred'),semanticStatus:'unverified'};
}
export async function requestWholePage(input:WholePageInput,fetcher:typeof fetch=fetch):Promise<WholePageUnderstanding>{
 const started=Date.now();input.signal?.throwIfAborted();const scope=scopeValue(input);
 const transport:Transport={baseUrl:input.baseUrl,model:input.model,apiKey:input.apiKey,wireApi:input.wireApi,reasoningEffort:input.reasoningEffort,signal:input.signal};
 const sourceKey=wholePageKey(scope,transport);
 if(!Array.isArray(input.images)||input.images.length!==scope.pages.length||input.images.some((p,i)=>p.pageId!==scope.pages[i].id||!['image/png','image/jpeg','image/webp'].includes(p.mime)||!(p.image instanceof Uint8Array)||p.image.length===0||p.image.length>20_000_000)||input.images.reduce((n,p)=>n+p.image.length,0)>40_000_000)throw invalid();
 const content:unknown[]=[{type:'text',text:JSON.stringify({version:WHOLE_PAGE_VERSION,direction:scope.direction,context:scope.context})}];
 for(const [i,image] of input.images.entries()){
  content.push({type:'text',text:JSON.stringify({pageId:image.pageId,pageNumber:scope.pages[i].pageNumber})});
  content.push({type:'image_url',image_url:{url:`data:${image.mime};base64,${Buffer.from(image.image).toString('base64')}`,detail:'high'}});
 }
 const {data,usage}=await requestStoryJson(transport,[{role:'system',content:WHOLE_PAGE_PROMPT},{role:'user',content}],fetcher,z.toJSONSchema(wholePageOutputSchema));
 return {...validateWholePage(data,scope),version:WHOLE_PAGE_VERSION,sourceKey,scopePageIds:scope.pages.map(p=>p.id),direction:scope.direction,model:transport.model,durationMs:Date.now()-started,usage};
}

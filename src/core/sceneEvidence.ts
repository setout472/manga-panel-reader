import {createHash} from 'node:crypto';
import {z} from 'zod';
import {ApiError} from './inference';
import {requestStoryJson} from './story';
import {transportIdentity,type WireOptions} from './wire';
import {wholePageScopeSchema,type WholePageScope} from '../shared/wholePage';
import {sceneEvidenceSchema,sceneIssueSchema,sceneReviewSchema,type SceneEvidenceOutput,type SceneEvidenceTrace,type SceneEvidenceIssue} from '../shared/sceneEvidence';
import {SCENE_EVIDENCE_VERSION,SCENE_REVIEW_VERSION,SCENE_EVIDENCE_PROMPT,SCENE_REVIEW_PROMPT} from './sceneEvidencePrompt';
type Transport=WireOptions&{model:string;baseUrl:string;apiKey:string;signal?:AbortSignal;imageDetail?:'high'|'original'};
export type SceneEvidenceInput=WholePageScope&Transport&{images:{pageId:string;image:Uint8Array;mime:string}[]};
const fail=()=>new ApiError('整页证据结构、页序或复核来源无效');
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function evidenceScope(input:WholePageScope){const parsed=wholePageScopeSchema.safeParse(input);if(!parsed.success)throw fail();const s=parsed.data;if(new Set(s.pages.map(p=>p.id)).size!==s.pages.length||s.pages.some((p,i)=>i>0&&p.pageNumber<=s.pages[i-1].pageNumber))throw fail();return s}
export function validateSceneEvidence(value:unknown,input:WholePageScope){
 const scope=evidenceScope(input),parsed=sceneEvidenceSchema.safeParse(value);if(!parsed.success)throw fail();const data=parsed.data;
 if(JSON.stringify(data).length>120000||data.pages.length!==scope.pages.length||data.pages.some((p,i)=>p.pageNumber!==scope.pages[i].pageNumber))throw fail();
 const requiresReview=data.uncertain.length>0||data.pages.some(p=>p.persons.some(label=>/旁白|画外文字|畫外文字/.test(label))||p.dialogue.some(d=>/^(未知|不确定|不確定|unknown)$/i.test(d.speaker)));
 return {...data,pages:data.pages.map((p,i)=>({...p,pageId:scope.pages[i].id})),requiresReview,semanticStatus:'unverified' as const};
}
export function sceneEvidenceKey(scope:WholePageScope,config:WireOptions&{model:string;baseUrl:string;imageDetail?:'high'|'original'}){const fields:unknown[]=[SCENE_EVIDENCE_VERSION,SCENE_EVIDENCE_PROMPT,z.toJSONSchema(sceneEvidenceSchema),evidenceScope(scope),config.model,transportIdentity(config.baseUrl,config)];if(config.imageDetail==='original')fields.push('image-detail:original');return hash(fields)}
export function traceOutput(trace:SceneEvidenceTrace):SceneEvidenceOutput{return {pages:trace.pages.map(({pageId,...p})=>p),uncertain:trace.uncertain}}
export function sceneEvidenceDigest(trace:Omit<SceneEvidenceTrace,'contentDigest'>|SceneEvidenceTrace){const fields:unknown[]=[trace.version,trace.promptVersion,trace.stage,trace.sourceKey,trace.sourceScope,traceOutput({...trace,contentDigest:''}),trace.issues,trace.reviewFlag,trace.originDigest??null,trace.requiresReview,trace.model];if(trace.correction)fields.push(trace.correction);return hash(fields)}
export function validateSceneTrace(trace:SceneEvidenceTrace,scope:WholePageScope){
 const source=evidenceScope(scope);if(!trace||JSON.stringify(trace.sourceScope)!==JSON.stringify(source)||!/^[a-f0-9]{64}$/.test(trace.sourceKey)||sceneEvidenceDigest(trace)!==trace.contentDigest||!['extracted','reviewed','assisted'].includes(trace.stage)||trace.pages.length!==source.pages.length||trace.pages.some((p,i)=>p.pageId!==source.pages[i].id)||(trace.stage!=='extracted'&&!/^[a-f0-9]{64}$/.test(trace.originDigest??'')))throw fail();
 const correctionSchema=z.object({reviewer:z.enum(['human','ai-assisted']),version:z.string().min(1).max(100),recordDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
 if(trace.semanticStatus!=='unverified'||trace.version!==SCENE_EVIDENCE_VERSION||(trace.stage==='assisted'?(trace.promptVersion!=='scene-assisted-v1'||!correctionSchema.safeParse(trace.correction).success):trace.correction!==undefined||(trace.stage==='reviewed'?trace.promptVersion!==SCENE_REVIEW_VERSION:trace.promptVersion!==SCENE_EVIDENCE_VERSION&&!/^recorded-import:[a-f0-9]{64}$/.test(trace.promptVersion))))throw fail();
 const parsedIssues=z.array(sceneIssueSchema).max(24).safeParse(trace.issues);if(!parsedIssues.success)throw fail();
 const data=validateSceneEvidence(traceOutput(trace),source);for(const issue of parsedIssues.data){if(!source.pages.some(p=>p.pageNumber===issue.pageNumber))throw fail()}
 if(trace.requiresReview!==(data.requiresReview||trace.reviewFlag||trace.issues.some(i=>i.severity==='core')))throw fail();
 return structuredClone(trace);
}
function createTrace(data:unknown,scope:WholePageScope,model:string,sourceKey:string,stage:'extracted'|'reviewed',promptVersion:string,issues:SceneEvidenceIssue[]=[],reviewFlag=false,originDigest?:string):SceneEvidenceTrace{
 const value={...validateSceneEvidence(data,scope),version:SCENE_EVIDENCE_VERSION,promptVersion,stage,sourceKey,sourceScope:evidenceScope(scope),model,durationMs:0,issues,reviewFlag,...(originDigest?{originDigest}:{}),contentDigest:''};
 value.requiresReview=value.requiresReview||reviewFlag||issues.some(i=>i.severity==='core');value.contentDigest=sceneEvidenceDigest(value);return value;
}
export function importRecordedEvidence(data:unknown,scope:WholePageScope,model:string,recordedPrompt:string){return createTrace(data,scope,model,hash(['recorded-evidence-import-v1',evidenceScope(scope),data,recordedPrompt]),'extracted','recorded-import:'+hash(recordedPrompt))}
function prepared(input:SceneEvidenceInput){
 input.signal?.throwIfAborted();if(input.imageDetail!==undefined&&!['high','original'].includes(input.imageDetail))throw fail();const detail=input.imageDetail??'high',scope=evidenceScope(input),transport:Transport={model:input.model,baseUrl:input.baseUrl,wireApi:input.wireApi,reasoningEffort:input.reasoningEffort,apiKey:input.apiKey,signal:input.signal,imageDetail:detail};
 if(!Array.isArray(input.images)||input.images.length!==scope.pages.length||input.images.some((p,i)=>p.pageId!==scope.pages[i].id||!['image/jpeg','image/png','image/webp'].includes(p.mime)||!(p.image instanceof Uint8Array)||!p.image.length||p.image.length>20000000)||input.images.reduce((n,p)=>n+p.image.length,0)>40000000)throw fail();
 const content:unknown[]=[{type:'text',text:JSON.stringify({direction:scope.direction,context:scope.context})}];for(const [i,image] of input.images.entries()){content.push({type:'text',text:JSON.stringify({pageId:image.pageId,pageNumber:scope.pages[i].pageNumber})},{type:'image_url',image_url:{url:`data:${image.mime};base64,${Buffer.from(image.image).toString('base64')}`,detail}})}return {scope,transport,content};
}
export async function requestSceneEvidence(input:SceneEvidenceInput,fetcher:typeof fetch=fetch){
 const started=Date.now(),{scope,transport,content}=prepared(input),key=sceneEvidenceKey(scope,transport);
 const {data,usage}=await requestStoryJson(transport,[{role:'system',content:SCENE_EVIDENCE_PROMPT},{role:'user',content}],fetcher,z.toJSONSchema(sceneEvidenceSchema));
 return {...createTrace(data,scope,transport.model,key,'extracted',SCENE_EVIDENCE_VERSION),durationMs:Date.now()-started,usage};
}
export async function requestSceneEvidenceReview(input:SceneEvidenceInput&{candidate:SceneEvidenceTrace},fetcher:typeof fetch=fetch){
 const started=Date.now(),{scope,transport,content}=prepared(input),candidate=validateSceneTrace(input.candidate,scope);
 const keyFields:unknown[]=[SCENE_REVIEW_VERSION,SCENE_REVIEW_PROMPT,candidate.contentDigest,scope,transport.model,transportIdentity(transport.baseUrl,transport)];if(transport.imageDetail==='original')keyFields.push('image-detail:original');const key=hash(keyFields);
 content.push({type:'text',text:JSON.stringify({candidate:traceOutput(candidate),candidateDigest:candidate.contentDigest})});
 const {data,usage}=await requestStoryJson(transport,[{role:'system',content:SCENE_REVIEW_PROMPT},{role:'user',content}],fetcher,z.toJSONSchema(sceneReviewSchema));
 const parsed=sceneReviewSchema.safeParse(data);if(!parsed.success||parsed.data.issues.some(p=>!scope.pages.some(s=>s.pageNumber===p.pageNumber)))throw fail();
 return {...createTrace(parsed.data.evidence,scope,transport.model,key,'reviewed',SCENE_REVIEW_VERSION,parsed.data.issues,parsed.data.needsReview,candidate.contentDigest),durationMs:Date.now()-started,usage};
}

import {existsSync,mkdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {Library,atomicJson} from './library';
import {evidenceScope,validateSceneTrace} from '../core/sceneEvidence';
import {acceptedSceneTrace,acceptanceSchema,type SceneAcceptance} from '../core/scenePipeline';
import type {SceneEvidenceTrace} from '../shared/sceneEvidence';
import type {WholePageScope} from '../shared/wholePage';
const key=(x:string)=>{if(!/^[a-f0-9]{64}$/.test(x))throw Error('整页缓存标识无效');return x};
const traceKeys=['pages','uncertain','requiresReview','semanticStatus','version','promptVersion','stage','sourceKey','contentDigest','sourceScope','model','durationMs','usage','issues','reviewFlag','originDigest','correction'];
function checkedTrace(value:SceneEvidenceTrace,scope:WholePageScope){
 if(!value||Object.keys(value).some(k=>!traceKeys.includes(k))||typeof value.model!=='string'||!value.model||value.model.length>300||!Number.isFinite(value.durationMs)||value.durationMs<0||typeof value.reviewFlag!=='boolean'||typeof value.requiresReview!=='boolean')throw Error('整页缓存字段无效');
 if(value.usage&&!z.object({prompt_tokens:z.number().finite().nonnegative().optional(),completion_tokens:z.number().finite().nonnegative().optional(),total_tokens:z.number().finite().nonnegative().optional()}).strict().safeParse(value.usage).success)throw Error('整页缓存用量无效');
 return validateSceneTrace(value,scope);
}
const readJson=(path:string)=>{if(statSync(path).size>500000)throw Error('整页缓存过大');return JSON.parse(readFileSync(path,'utf8'))};
/** Immutable model/assisted snapshots; review receipts are separate and atomic. No network. */
export class SceneStore{
 constructor(private library:Library){}
 private paths(chapterId:string,sourceKey:string,digest:string){const dir=join(this.library.chapterDir(chapterId),'scene-results');const stem=key(sourceKey)+'-'+key(digest);return {dir,tracePath:join(dir,stem+'.json'),reviewPath:join(dir,stem+'.review.json')}}
 private source(chapterId:string,input:WholePageScope){const scope=evidenceScope(input),chapter=this.library.get(chapterId);if(chapter.direction!==scope.direction||scope.pages.some(p=>{const original=chapter.pages.find(x=>x.id===p.id);return !original||original.index+1!==p.pageNumber||original.hash!==p.hash||original.width!==p.width||original.height!==p.height}))throw Error('整页缓存原页已变化');return scope}
 save(chapterId:string,trace:SceneEvidenceTrace){const scope=this.source(chapterId,trace.sourceScope),value=checkedTrace(trace,scope),paths=this.paths(chapterId,value.sourceKey,value.contentDigest);mkdirSync(paths.dir,{recursive:true});if(existsSync(paths.tracePath)){this.load(chapterId,value.sourceKey,value.contentDigest,scope);return paths}atomicJson(paths.tracePath,{version:'scene-store-v1',chapterId,trace:value},false);return paths}
 private readTrace(chapterId:string,sourceKey:string,digest:string,input:WholePageScope){
  const scope=this.source(chapterId,input),paths=this.paths(chapterId,sourceKey,digest),raw=readJson(paths.tracePath);
  if(!raw||raw.version!=='scene-store-v1'||raw.chapterId!==chapterId||Object.keys(raw).some(k=>!['version','chapterId','trace'].includes(k)))throw Error('整页缓存版本无效');
  const trace=checkedTrace(raw.trace,scope);if(trace.sourceKey!==sourceKey||trace.contentDigest!==digest)throw Error('整页缓存来源不匹配');return {trace,scope,paths};
 }
 load(chapterId:string,sourceKey:string,digest:string,input:WholePageScope):{trace:SceneEvidenceTrace;review?:SceneAcceptance;recovered:boolean}{
  const {trace,scope,paths}=this.readTrace(chapterId,sourceKey,digest,input);
  const receipt=(path:string)=>{const r=acceptanceSchema.parse(readJson(path));if(r.sourceKey!==sourceKey||r.contentDigest!==digest)throw Error('复核缓存来源不匹配');if(r.decision==='approved')acceptedSceneTrace(trace,scope,r);return r};
  let review:SceneAcceptance|undefined,recovered=false;
  if(existsSync(paths.reviewPath)){try{review=receipt(paths.reviewPath)}catch(error){if(!existsSync(paths.reviewPath+'.bak'))throw error;review={...receipt(paths.reviewPath+'.bak'),decision:'needs-review',primaryErrors:['复核记录从备份恢复，请重新确认后再用于解说。']};atomicJson(paths.reviewPath,review,false);recovered=true}}
  return {trace,review,recovered};
 }
 review(chapterId:string,sourceKey:string,digest:string,scope:WholePageScope,record:SceneAcceptance){const stored=this.readTrace(chapterId,sourceKey,digest,scope),review=acceptanceSchema.parse(record);if(review.sourceKey!==sourceKey||review.contentDigest!==digest)throw Error('复核记录已过期');if(review.decision==='approved')acceptedSceneTrace(stored.trace,scope,review);atomicJson(stored.paths.reviewPath,review);return this.load(chapterId,sourceKey,digest,scope)}
}

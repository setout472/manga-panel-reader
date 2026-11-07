import {createHash} from 'node:crypto';
import {z} from 'zod';
import {ApiError} from './inference';
import {sceneEvidenceSchema,type SceneEvidenceTrace} from '../shared/sceneEvidence';
import type {WholePageScope} from '../shared/wholePage';
import {validateSceneTrace,validateSceneEvidence,traceOutput,sceneEvidenceDigest} from './sceneEvidence';
export const SCENE_CORRECTION_VERSION='scene-assisted-v1';
const digest=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const correctionSchema=z.object({sourceKey:z.string().regex(/^[a-f0-9]{64}$/),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),reviewer:z.enum(['human','ai-assisted']),version:z.string().min(1).max(100),changes:z.array(z.object({pageNumber:z.number().int().min(1),reason:z.string().trim().min(1).max(1000),page:sceneEvidenceSchema.shape.pages.element}).strict()).min(1).max(5),resolvedIssues:z.array(z.object({issueId:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(1).max(1000)}).strict()).max(24).optional()}).strict();
export type SceneCorrection=z.infer<typeof correctionSchema>;
export function sceneIssueId(trace:SceneEvidenceTrace,index:number):string{if(!Number.isInteger(index)||index<0||index>=trace.issues.length)throw new ApiError('证据疑点不存在');return digest([trace.contentDigest,index,trace.issues[index]])}
export function applySceneCorrections(trace:SceneEvidenceTrace,scope:WholePageScope,record:SceneCorrection):SceneEvidenceTrace{
 const checked=validateSceneTrace(trace,scope),parsed=correctionSchema.safeParse(record);
 if(!parsed.success||parsed.data.sourceKey!==checked.sourceKey||parsed.data.contentDigest!==checked.contentDigest||new Set(parsed.data.changes.map(c=>c.pageNumber)).size!==parsed.data.changes.length||parsed.data.changes.some(c=>c.pageNumber!==c.page.pageNumber||!checked.pages.some(p=>p.pageNumber===c.pageNumber)))throw new ApiError('证据修正来源或页面无效');
 const resolved=new Set((parsed.data.resolvedIssues??[]).map(r=>r.issueId)),known=new Set(checked.issues.map((_,i)=>sceneIssueId(checked,i)));
 if(resolved.size!==(parsed.data.resolvedIssues??[]).length||[...resolved].some(id=>!known.has(id)))throw new ApiError('证据疑点解决记录无效');
 const issues=checked.issues.filter((_,i)=>!resolved.has(sceneIssueId(checked,i)));
 const changes=parsed.data.changes,raw=traceOutput(checked),data=validateSceneEvidence({...raw,pages:raw.pages.map(p=>changes.find(c=>c.pageNumber===p.pageNumber)?.page??p)},scope);
 const correction={reviewer:parsed.data.reviewer,version:parsed.data.version,recordDigest:digest(parsed.data)};
 const out:SceneEvidenceTrace={...checked,...data,issues,stage:'assisted',promptVersion:SCENE_CORRECTION_VERSION,sourceKey:digest([SCENE_CORRECTION_VERSION,checked.sourceKey,checked.contentDigest,correction]),originDigest:checked.contentDigest,correction,contentDigest:''};
 out.requiresReview=data.requiresReview||checked.reviewFlag||issues.some(i=>i.severity==='core');out.contentDigest=sceneEvidenceDigest(out);return validateSceneTrace(out,scope);
}

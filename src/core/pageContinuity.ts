import {createHash} from 'node:crypto';
import {z} from 'zod';
import {ApiError} from './inference';
import {validateWholePage} from './wholePage';
import {wholePageScopeSchema,type WholePageScope,type WholePageUnderstanding} from '../shared/wholePage';

export const CONTINUITY_VERSION='whole-page-continuity-v1';
const reviewSchema=z.object({
 sourceKey:z.string().regex(/^[a-f0-9]{64}$/),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),
 decision:z.enum(['approved','needs-review']),primaryErrors:z.array(z.string().min(1).max(1000)).max(40),
 reviewer:z.enum(['human','ai-assisted']),version:z.string().trim().min(1).max(100),
}).strict();
export type ContinuityReview=z.infer<typeof reviewSchema>;
function projection(value:WholePageUnderstanding,scope:WholePageScope){
 const parsed=wholePageScopeSchema.safeParse(scope);if(!parsed.success)throw new ApiError('连续摘要来源范围无效');const sourceScope=parsed.data;
 if(value.direction!==sourceScope.direction||JSON.stringify(value.scopePageIds)!==JSON.stringify(sourceScope.pages.map(p=>p.id))||typeof value.sourceKey!=='string'||!/^[a-f0-9]{64}$/.test(value.sourceKey))throw new ApiError('连续摘要来源范围不匹配');
 const data=validateWholePage({title:value.title,characters:value.characters,events:value.events,blocks:value.blocks.map(b=>({id:b.id,text:b.text,eventIds:b.eventIds})),unresolved:value.unresolved},sourceScope);
 return {version:value.version,sourceKey:value.sourceKey,scopePageIds:value.scopePageIds,direction:value.direction,sourceScope,data};
}
const digestOf=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function continuityDigest(value:WholePageUnderstanding,scope:WholePageScope):string{
 return digestOf(projection(value,scope));
}
export function buildContinuityContext(value:WholePageUnderstanding,scope:WholePageScope,record:ContinuityReview){
 const parsed=reviewSchema.safeParse(record);if(!parsed.success)throw new ApiError('连续摘要复核记录无效');const review=parsed.data;
 const content=projection(value,scope),digest=digestOf(content);
 if(review.sourceKey!==content.sourceKey||review.contentDigest!==digest||review.decision!=='approved'||review.primaryErrors.length||content.data.needsReview)throw new ApiError('前情存在未核对内容、核心疑点或主线错误，暂不继承');
 const pages=content.sourceScope.pages.map(page=>{
  const events=content.data.events.filter(e=>e.pageIds.includes(page.id));
  return {pageId:page.id,pageNumber:page.pageNumber,eventIds:events.map(e=>e.id),summary:events.map(e=>e.description).join(' ')};
 });
 const text=JSON.stringify({sourceKey:content.sourceKey,contentDigest:digest,characters:content.data.characters.map(c=>({id:c.id,label:c.label,role:c.role})),pageSummaries:pages,events:content.data.events,unresolved:content.data.unresolved,review:{version:review.version,reviewer:review.reviewer}});
 if(text.length>8000)throw new ApiError('前情摘要超过输入上限，请先压缩并重新核对');
 return {pages,context:{version:CONTINUITY_VERSION,text}};
}

import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {PageAsset} from '../shared/types';
import type {PageContent} from '../shared/story';
import {validatePanels} from './panels';
import {FACT_PROMPT,REVIEW_PROMPT,PROMPT_VERSION} from './prompts';
export const REVIEW_VERSION='image-first-review-v1';
export type PageReviewInput={candidate:PageContent;imageHash:string};
const nonempty=(max:number)=>z.string().trim().min(1).max(max);
const panel=z.object({panelId:nonempty(80),characters:z.array(nonempty(300)).max(30),dialogue:z.array(z.object({speaker:nonempty(200),text:nonempty(2000)})).max(60),description:nonempty(4000),uncertainties:z.array(nonempty(300)).max(30)});
const candidateSchema=z.object({pageId:nonempty(80),sourceKey:nonempty(200),model:nonempty(200),panels:z.array(panel).min(1).max(100),summary:nonempty(4000),needsReview:z.boolean()});
const panels=(page:PageAsset)=>validatePanels(page.override?.panels??page.analysis?.panels??[{id:'whole-page',x:0,y:0,width:1,height:1,order:1}]);
export function validateReview(page:PageAsset,review:PageReviewInput){
 if(review.imageHash!==page.hash)throw Error('本地候选与原图哈希不一致');
 const result=candidateSchema.safeParse(review.candidate);if(!result.success)throw Error('本地候选结构无效或超限');
 const c=result.data,ids=panels(page).map(p=>p.id);
 if(c.pageId!==page.id||c.panels.length!==ids.length||new Set(c.panels.map(p=>p.panelId)).size!==ids.length||c.panels.some(p=>!ids.includes(p.panelId)))throw Error('本地候选来源画格不匹配');
 if(JSON.stringify(c).length>60_000)throw Error('本地候选过长，请缩小内容');
 return {panels:c.panels.slice().sort((a,b)=>ids.indexOf(a.panelId)-ids.indexOf(b.panelId)),summary:c.summary};
}
export function reviewKey(page:PageAsset,model:string,baseUrl:string,maxImageSide:number,review:PageReviewInput){
 const candidate=validateReview(page,review);
 return createHash('sha256').update(JSON.stringify([REVIEW_VERSION,PROMPT_VERSION,FACT_PROMPT,REVIEW_PROMPT,page.id,page.hash,page.width,page.height,panels(page),page.override?.version??null,model,baseUrl.replace(/\/$/,''),maxImageSide,review.candidate.sourceKey,review.candidate.model,candidate])).digest('hex');
}
export type FactChange={ref:{pageId:string;panelId?:string};field:string;before:unknown;after:unknown};
/** Difference only: no correctness label, no rewriting local output. */
export function diffPageFacts(before:PageContent,after:PageContent):FactChange[]{
 if(before.pageId!==after.pageId||new Set(before.panels.map(p=>p.panelId)).size!==before.panels.length||before.panels.length!==after.panels.length||new Set(after.panels.map(p=>p.panelId)).size!==after.panels.length)throw Error('复核对照来源不匹配');
 const changes:FactChange[]=[];
 for(const old of before.panels){const next=after.panels.find(p=>p.panelId===old.panelId);if(!next)throw Error('复核对照来源不匹配');
  for(const field of ['characters','dialogue','description','uncertainties'] as const)if(JSON.stringify(old[field])!==JSON.stringify(next[field]))changes.push({ref:{pageId:before.pageId,panelId:old.panelId},field,before:structuredClone(old[field]),after:structuredClone(next[field])});
 }
 if(before.summary!==after.summary)changes.push({ref:{pageId:before.pageId},field:'summary',before:before.summary,after:after.summary});
 return changes;
}

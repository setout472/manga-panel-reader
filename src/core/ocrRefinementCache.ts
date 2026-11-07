import {createHash} from 'node:crypto';import type {PageAsset} from '../shared/types';import type {OcrRefinementCache,OcrRefinementResult} from '../shared/ocr';
import {ocrIsCached,ocrDocumentMatchesPage} from './ocrTask';import {planOcrCrops,refinementKey} from './ocrRefinement';
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function sealRefinement(result:OcrRefinementResult):OcrRefinementCache{const snapshot=structuredClone(result);return {version:'refinement-cache-v1',result:snapshot,checksum:digest(snapshot)}}
export function refinementIsCached(page:PageAsset):boolean{
 try{
  const cache=page.ocrRefinement;if(!cache||cache.version!=='refinement-cache-v1'||!ocrIsCached(page)||cache.checksum!==digest(cache.result))return false;
  const result=cache.result,plan=planOcrCrops(page),key=refinementKey(page,page.ocr!,plan);
  if(result.complete!==true||result.recipeKey!==key||result.document.cacheKey!==key||JSON.stringify(result.plan)!==JSON.stringify(plan)||!ocrDocumentMatchesPage(page,result.document)||!Number.isFinite(result.document.durationMs)||result.document.durationMs!<0||result.document.lines.some(l=>l.panelId!==undefined))return false;
  const base=new Map(page.ocr!.lines.map(l=>[l.id,l]));
  if(result.document.lines.some(l=>{if(l.needsReview)return false;const original=base.get(l.id);return !original||original.needsReview||original.panelId!==undefined||l.text!==original.text||l.confidence!==original.confidence||JSON.stringify(l.poly)!==JSON.stringify(original.poly)||(['x','y','width','height'] as const).some(k=>l.bounds[k]!==original.bounds[k])}))return false;
  return Array.isArray(result.runs)&&result.runs.length===plan.crops.length&&result.runs.every((run,i)=>run.panelId===plan.crops[i].panelId&&run.status==='done'&&Number.isFinite(run.durationMs)&&run.durationMs>=0&&Number.isInteger(run.lines)&&run.lines!>=0&&run.lines!<=3000);
 }catch{return false}
}

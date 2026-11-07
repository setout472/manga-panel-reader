import sharp from 'sharp';import {createHash} from 'node:crypto';
import type {PageAsset} from '../shared/types';import type {OcrDocument,OcrRefinementResult} from '../shared/ocr';
import {imageInfo} from './images';import {ocrIsCached,normalizeCropOcrOutput} from '../core/ocrTask';import {mergeOcr} from '../core/ocr';
import {planOcrCrops,refinementKey,OCR_REFINEMENT_PARAMETERS,type CropPlan} from '../core/ocrRefinement';
type Engine={recognize(bytes:Uint8Array,signal:AbortSignal):Promise<any>};
export type RefinementResult=OcrRefinementResult;
/** Pure candidate production: callers own engine lifetime and decide whether to persist. */
export async function refineOcrPage(source:PageAsset,bytes:Uint8Array,whole:OcrDocument,engine:Engine,signal:AbortSignal,parameters=OCR_REFINEMENT_PARAMETERS):Promise<RefinementResult>{
 signal.throwIfAborted();const page=structuredClone(source),base=structuredClone(whole),plan=planOcrCrops(page,parameters);
 if(bytes.byteLength>30*1024*1024)throw Error('OCR增强原图过大');const original=Buffer.from(bytes);
 if(createHash('sha256').update(original).digest('hex')!==page.hash)throw Error('OCR增强原图哈希不匹配');
 if(!ocrIsCached({...page,ocr:base}))throw Error('OCR增强需要有效的整页OCR缓存');
 const info=await imageInfo(original);signal.throwIfAborted();if(info.width!==page.width||info.height!==page.height)throw Error('OCR增强原图尺寸不匹配');
 const recipeKey=refinementKey(page,base,plan),runs:RefinementResult['runs']=[],start=Date.now();
 // Cached panel IDs are display-layer hints, not authoritative ownership.
 // Keep raw base separately; candidates make no panel assignment claims.
 let document:OcrDocument={...base,lines:base.lines.map(({panelId,...line})=>({...line,needsReview:line.needsReview||panelId!==undefined}))};
 for(const crop of plan.crops){
  signal.throwIfAborted();const t=Date.now();
  try{
   const input=await sharp(original,{limitInputPixels:60_000_000}).rotate().extract({left:crop.left,top:crop.top,width:crop.width,height:crop.height}).resize(crop.width*crop.scale,crop.height*crop.scale,{kernel:'lanczos3'}).flatten({background:'#fff'}).jpeg({quality:95}).toBuffer();
   signal.throwIfAborted();const raw=await engine.recognize(input,signal);signal.throwIfAborted();const mapped=normalizeCropOcrOutput(page,raw,crop,Date.now()-t);
   // High scores also occurred on Japanese SFX misread as Chinese characters.
   // Preserve all crop suggestions as review candidates, including replacements.
   mapped.lines=mapped.lines.map(l=>({...l,needsReview:true}));const combined=mergeOcr(document,mapped);
   if(combined.lines.length>3000||new Set(combined.lines.map(l=>l.id)).size!==combined.lines.length)throw Error('OCR增强结果数量或ID无效');
   document=combined;runs.push({panelId:crop.panelId,status:'done',durationMs:Date.now()-t,lines:mapped.lines.length});
  }catch(e){signal.throwIfAborted();runs.push({panelId:crop.panelId,status:'error',durationMs:Date.now()-t,error:e instanceof Error?e.message:'OCR局部识别失败'})}
 }
 signal.throwIfAborted();const complete=runs.every(r=>r.status==='done');
 return {document:{...document,cacheKey:complete?recipeKey:undefined,durationMs:Date.now()-start,createdAt:new Date().toISOString()},recipeKey,complete,plan,runs};
}

import {createHash} from 'node:crypto';
import type {PageAsset} from '../shared/types';
import type {OcrDocument,OcrCrop} from '../shared/ocr';
import {normalizeOcr,mapCropOcr} from './ocr';
export const OCR_MODEL='PP-OCRv6_small';
export const OCR_PARAMETERS={version:'ocr-whole-v1',sdk:'0.4.2',maxSide:2048,threshold:0,backend:'wasm'};
export const ocrKey=(page:PageAsset,parameters=OCR_PARAMETERS)=>createHash('sha256').update(JSON.stringify([page.id,page.hash,page.width,page.height,OCR_MODEL,parameters])).digest('hex');
export function normalizeOcrOutput(page:PageAsset,raw:any,durationMs:number):OcrDocument{
 const doc=normalizeOcr(raw,{pageId:page.id,imageHash:page.hash,model:OCR_MODEL});
 if(!Number.isFinite(durationMs)||durationMs<0||Math.abs(doc.width/doc.height-page.width/page.height)>.01)throw Error('OCR图片比例或耗时无效');
 // normalized coordinates already refer to the full resized input; geometry is independent from manual panels.
 return {...doc,width:page.width,height:page.height,cacheKey:ocrKey(page),durationMs,createdAt:new Date().toISOString()};
}
export type {OcrCrop} from '../shared/ocr';
/** A local crop is never a valid whole-page cache. The coordinator owns the recipe key. */
export function normalizeCropOcrOutput(page:PageAsset,raw:any,crop:OcrCrop,durationMs:number):OcrDocument{
 if(![page.width,page.height,crop.left,crop.top,crop.width,crop.height,crop.scale].every(Number.isSafeInteger)||page.width<=0||page.height<=0||crop.left<0||crop.top<0||crop.width<=0||crop.height<=0||crop.scale<1||crop.scale>2||crop.left+crop.width>page.width||crop.top+crop.height>page.height||!Number.isFinite(durationMs)||durationMs<0)throw Error('OCR裁图参数无效');
 if(raw?.image?.width!==crop.width*crop.scale||raw?.image?.height!==crop.height*crop.scale)throw Error('OCR裁图输出尺寸不匹配');
 const doc=normalizeOcr(raw,{pageId:page.id,imageHash:page.hash,model:OCR_MODEL});
 return {...mapCropOcr(doc,{left:crop.left,top:crop.top,scale:crop.scale,originalWidth:page.width,originalHeight:page.height}),durationMs};
}
export function ocrIsCached(page:PageAsset):boolean{
 const doc=page.ocr;return !!doc&&doc.cacheKey===ocrKey(page)&&ocrDocumentMatchesPage(page,doc);
}
export function ocrDocumentMatchesPage(page:PageAsset,doc:OcrDocument|undefined):boolean{
 if(!doc||doc.pageId!==page.id||doc.imageHash!==page.hash||doc.model!==OCR_MODEL||doc.width!==page.width||doc.height!==page.height)return false;
 try{
  const checked=normalizeOcr({image:{width:doc.width,height:doc.height},items:doc.lines.map(l=>({text:l.text,score:l.confidence,poly:l.poly.map(([x,y])=>[x*doc.width,y*doc.height])}))},{pageId:page.id,imageHash:page.hash,model:doc.model});
  return new Set(doc.lines.map(l=>l.id)).size===doc.lines.length&&doc.lines.every((l,i)=>typeof l.id==='string'&&l.id.length>0&&l.id.length<=200&&typeof l.needsReview==='boolean'&&l.bounds&&(['x','y','width','height'] as const).every(k=>Number.isFinite(l.bounds[k])&&Math.abs(l.bounds[k]-checked.lines[i].bounds[k])<1e-6));
 }catch{return false}
}

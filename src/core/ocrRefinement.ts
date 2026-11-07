import {createHash} from 'node:crypto';import type {PageAsset} from '../shared/types';import type {OcrDocument,OcrCropPlan} from '../shared/ocr';
import {validatePanels} from './panels';import {OCR_PARAMETERS,OCR_MODEL,type OcrCrop} from './ocrTask';
export const OCR_REFINEMENT_PARAMETERS={version:'ocr-panel-crops-v1',scale:2,margin:16,maxCrops:6,maxSide:3072,maxPixels:32_000_000,mergeVersion:'overlap-fragment-v1',reviewPolicy:'all-crop-candidates-v1',assignmentPolicy:'no-panel-claims-v1'};
export type CropPlan=OcrCropPlan;
export function planOcrCrops(page:PageAsset,parameters=OCR_REFINEMENT_PARAMETERS):CropPlan{
 const p={...parameters};if(![page.width,page.height,p.scale,p.margin,p.maxCrops,p.maxSide,p.maxPixels].every(Number.isSafeInteger)||page.width<=0||page.height<=0||page.width*page.height>60_000_000||p.scale!==2||p.margin<0||p.margin>64||p.maxCrops<1||p.maxCrops>6||p.maxSide<1||p.maxSide>3072||p.maxPixels<1||p.maxPixels>32_000_000||p.version!==OCR_REFINEMENT_PARAMETERS.version||p.mergeVersion!==OCR_REFINEMENT_PARAMETERS.mergeVersion||p.reviewPolicy!==OCR_REFINEMENT_PARAMETERS.reviewPolicy||p.assignmentPolicy!==OCR_REFINEMENT_PARAMETERS.assignmentPolicy)throw Error('OCR局部参数无效');
 const value=page.override!==undefined?page.override?.panels:page.analysis!==undefined?page.analysis?.panels:[];
 if(!Array.isArray(value))throw Error('OCR画格列表无效');
 const panels=value.length?validatePanels(value):[],plan:CropPlan={parameters:p,crops:[],skipped:[],totalPixels:0},seen=new Set<string>();
 for(const panel of panels){
  const left=Math.max(0,Math.floor(panel.x*page.width)-p.margin),top=Math.max(0,Math.floor(panel.y*page.height)-p.margin),right=Math.min(page.width,Math.ceil((panel.x+panel.width)*page.width)+p.margin),bottom=Math.min(page.height,Math.ceil((panel.y+panel.height)*page.height)+p.margin),width=right-left,height=bottom-top,pixels=width*height*p.scale*p.scale,key=JSON.stringify([left,top,width,height]);
  let reason:CropPlan['skipped'][number]['reason']|undefined;
  if(width*height>=page.width*page.height*.98)reason='whole-page';else if(seen.has(key))reason='duplicate';else if(width*p.scale>p.maxSide||height*p.scale>p.maxSide)reason='size';else if(plan.crops.length>=p.maxCrops||plan.totalPixels+pixels>p.maxPixels)reason='budget';
  seen.add(key);if(reason){plan.skipped.push({panelId:panel.id,reason});continue}plan.crops.push({panelId:panel.id,left,top,width,height,scale:p.scale});plan.totalPixels+=pixels;
 }
 return plan;
}
export function refinementKey(page:PageAsset,base:OcrDocument,plan:CropPlan):string{
 return createHash('sha256').update(JSON.stringify([page.id,page.hash,page.width,page.height,OCR_MODEL,OCR_PARAMETERS,base.model,base.cacheKey,base.lines,plan.parameters,plan.crops,plan.skipped])).digest('hex');
}

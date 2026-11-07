import {createHash} from 'node:crypto';
import type {Panel,Rect,PageAsset} from '../shared/types';
import {validatePanels} from './panels';
import type {OcrLine,OcrDocument} from '../shared/ocr';
export type {OcrLine,OcrDocument} from '../shared/ocr';
export const OCR_EVIDENCE_VERSION='local-ocr-evidence-v1';
export function ocrEvidencePayload(page:PageAsset,doc:OcrDocument){
 if(doc.pageId!==page.id||doc.imageHash!==page.hash||doc.width!==page.width||doc.height!==page.height||typeof doc.model!=='string'||!doc.model.trim()||doc.model.length>200||!Array.isArray(doc.lines)||doc.lines.length>3000)throw Error('OCR证据来源已变化或不匹配');
 const panels=page.override?.panels??page.analysis?.panels??[{id:'whole-page',x:0,y:0,width:1,height:1,order:1}],ids=panels.map(p=>p.id);
 const checked=normalizeOcr({image:{width:doc.width,height:doc.height},items:doc.lines.map(l=>({text:l.text,score:l.confidence,poly:l.poly.map(([x,y])=>[x*doc.width,y*doc.height])}))},{pageId:doc.pageId,imageHash:doc.imageHash,model:doc.model});
 if(doc.lines.some(l=>l.panelId!==undefined&&!ids.includes(l.panelId)))throw Error('OCR证据画格已失效');
 const assigned=assignOcrToPanels(checked,panels);
 const result={version:OCR_EVIDENCE_VERSION,model:doc.model,lines:assigned.lines.map((l,i)=>({text:l.text,confidence:l.confidence,bounds:l.bounds,panelId:l.panelId??null,needsReview:l.needsReview||doc.lines[i].needsReview||(doc.lines[i].panelId!==undefined&&doc.lines[i].panelId!==l.panelId)}))};
 if(JSON.stringify(result).length>60_000)throw Error('OCR证据过长，请缩小范围');return result;
}
export function normalizeOcr(raw:any,source:{pageId:string;imageHash:string;model:string}):OcrDocument{
 const {width,height}=raw?.image||{};if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||!Array.isArray(raw?.items)||raw.items.length>3000)throw Error('OCR图片尺寸或数量无效');
 const lines:OcrLine[]=raw.items.map((line:any,index:number)=>{
  if(typeof line.text!=='string'||!line.text.trim()||line.text.length>4000||!Number.isFinite(line.score)||line.score<0||line.score>1||!Array.isArray(line.poly)||line.poly.length!==4)throw Error('OCR文字或坐标无效');
  const poly:[number,number][]=line.poly.map((p:any)=>{if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[0]>width||p[1]<0||p[1]>height)throw Error('OCR坐标越界');return [p[0]/width,p[1]/height]});
  const x=Math.min(...poly.map(p=>p[0])),y=Math.min(...poly.map(p=>p[1])),right=Math.max(...poly.map(p=>p[0])),bottom=Math.max(...poly.map(p=>p[1]));
  if(right<=x||bottom<=y)throw Error('OCR空矩形');
  return {id:'ocr-'+createHash('sha256').update(JSON.stringify([source.pageId,source.imageHash,source.model,index,line.text,poly])).digest('hex'),text:line.text,confidence:line.score,poly,bounds:{x,y,width:right-x,height:bottom-y},needsReview:line.score<.8};
 });
 return {...source,width,height,lines};
}
function overlap(a:Rect,b:Rect){return Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))}
export function assignOcrToPanels(doc:OcrDocument,panels:Panel[]):OcrDocument{
 const valid=validatePanels(panels);
 return {...doc,lines:doc.lines.map(line=>{
  const candidates=valid.map(p=>({id:p.id,ratio:overlap(line.bounds,p)/(line.bounds.width*line.bounds.height)})).sort((a,b)=>b.ratio-a.ratio);
  const top=candidates[0],next=candidates[1],unique=top&&top.ratio>=.6&&(!next||top.ratio-next.ratio>=.2);
  return {...line,panelId:unique?top.id:undefined,needsReview:line.needsReview||!unique};
 })};
}
/** Reading hints only; scattered bubbles and irregular text require review, not universal sorting claims. */
export function orderOcr(lines:OcrLine[],direction:'rtl'|'ltr'):OcrLine[]{
 return lines.slice().sort((a,b)=>{
  const vertical=a.bounds.height>a.bounds.width*1.4&&b.bounds.height>b.bounds.width*1.4;
  if(vertical&&Math.abs(a.bounds.x-b.bounds.x)>.01)return direction==='rtl'?b.bounds.x-a.bounds.x:a.bounds.x-b.bounds.x;
  if(Math.abs(a.bounds.y-b.bounds.y)>.03)return a.bounds.y-b.bounds.y;
  return direction==='rtl'?b.bounds.x-a.bounds.x:a.bounds.x-b.bounds.x;
 });
}
export function mapCropOcr(doc:OcrDocument,t:{left:number;top:number;scale:number;originalWidth:number;originalHeight:number}):OcrDocument{
 if(!Object.values(t).every(Number.isFinite)||t.scale<=0||t.originalWidth<=0||t.originalHeight<=0||t.left<0||t.top<0||t.left+doc.width/t.scale>t.originalWidth||t.top+doc.height/t.scale>t.originalHeight)throw Error('OCR裁图映射越界');
 return normalizeOcr({image:{width:t.originalWidth,height:t.originalHeight},items:doc.lines.map(l=>({text:l.text,score:l.confidence,poly:l.poly.map(([x,y])=>[t.left+x*doc.width/t.scale,t.top+y*doc.height/t.scale])}))},{pageId:doc.pageId,imageHash:doc.imageHash,model:doc.model});
}
export function mergeOcr(a:OcrDocument,b:OcrDocument):OcrDocument{
 if(a.pageId!==b.pageId||a.imageHash!==b.imageHash||a.width!==b.width||a.height!==b.height||a.model!==b.model)throw Error('OCR合并来源不匹配');
 const lines=structuredClone(a.lines);
 for(const incoming of structuredClone(b.lines)){
  const index=lines.findIndex(l=>{const i=overlap(l.bounds,incoming.bounds),a=l.bounds.width*l.bounds.height,b=incoming.bounds.width*incoming.bounds.height;return i/(a+b-i)>.5||(i/Math.min(a,b)>=.8&&(l.text.includes(incoming.text)||incoming.text.includes(l.text)))});
  if(index<0){lines.push(incoming);continue}const current=lines[index];
  if(current.text===incoming.text){if(incoming.confidence>current.confidence)lines[index]=incoming;continue}
  if(incoming.text.includes(current.text)&&incoming.text.length>current.text.length){lines[index]=incoming;continue}
  if(current.text.includes(incoming.text)&&current.text.length>incoming.text.length)continue;
  current.needsReview=true;incoming.needsReview=true;lines.push(incoming);
 }
 return {...a,lines};
}

import type {PageAsset,Panel,Rect} from '../shared/types';
import type {OcrLine,OcrDocument} from '../shared/ocr';
import {suggestOcrOrder} from './ocrReadingOrder';
function validRect(r:Rect){return r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=1.000001}
function overlap(a:Rect,b:Rect){return Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))}
function validLine(l:OcrLine){
 if(!l||typeof l!=='object'||typeof l.id!=='string'||typeof l.text!=='string'||!l.text.trim()||l.text.length>4000||!Number.isFinite(l.confidence)||l.confidence<0||l.confidence>1||!validRect(l.bounds)||!Array.isArray(l.poly)||l.poly.length!==4||l.poly.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1)))return false;
 const x=Math.min(...l.poly.map(p=>p[0])),y=Math.min(...l.poly.map(p=>p[1])),width=Math.max(...l.poly.map(p=>p[0]))-x,height=Math.max(...l.poly.map(p=>p[1]))-y;
 return width>0&&height>0&&[x-l.bounds.x,y-l.bounds.y,width-l.bounds.width,height-l.bounds.height].every(n=>Math.abs(n)<1e-6);
}
export function validOcrDocumentForReading(page:PageAsset|undefined,doc:OcrDocument|null|undefined):doc is OcrDocument{
 return !!page&&!!doc&&doc.pageId===page.id&&doc.imageHash===page.hash&&doc.width===page.width&&doc.height===page.height&&typeof doc.model==='string'&&!!doc.model.trim()&&doc.model.length<=200&&Array.isArray(doc.lines)&&doc.lines.length<=3000&&doc.lines.every(validLine);
}
export function ocrForReading(page:PageAsset|undefined,panels:Panel[],mode:'page'|'panel',currentId:string,direction:'rtl'|'ltr'='rtl',doc:OcrDocument|null|undefined=page?.ocr):{state:'ready'|'missing'|'stale';lines:OcrLine[];originalLines:OcrLine[];unassigned:number;model?:string}{
 const empty={lines:[],originalLines:[],unassigned:0};if(!doc)return {...empty,state:'missing'};
 if(!validOcrDocumentForReading(page,doc)||panels.some(p=>!validRect(p)))return {...empty,state:'stale'};
 const assigned=doc.lines.map(l=>{
  const ranked=panels.map(p=>({id:p.id,ratio:overlap(l.bounds,p)/(l.bounds.width*l.bounds.height)})).sort((a,b)=>b.ratio-a.ratio),top=ranked[0],second=ranked[1];
  const panelId=top&&top.ratio>=.6&&(!second||top.ratio-second.ratio>=.2)?top.id:undefined;
  return {...l,panelId,needsReview:l.needsReview||l.confidence<.8||!panelId||(l.panelId!==undefined&&l.panelId!==panelId)};
 });
 const originalLines=assigned.filter(l=>mode==='page'||l.panelId===currentId);
 return {state:'ready',lines:suggestOcrOrder(originalLines,panels,direction,doc.width,doc.height),originalLines,unassigned:assigned.filter(l=>!l.panelId).length,model:doc.model};
}

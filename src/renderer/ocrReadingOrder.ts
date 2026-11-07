import type {OcrLine} from '../shared/ocr';
import type {Panel} from '../shared/types';
type Axis='x'|'y';
function gapCut(lines:OcrLine[],axis:Axis,pixels:number){
 const size=axis==='x'?'width':'height',sorted=lines.slice().sort((a,b)=>a.bounds[axis]-b.bounds[axis]||a.bounds[size]-b.bounds[size]);
 let end=sorted[0].bounds[axis]+sorted[0].bounds[size],largest=0,cut=0;
 for(let i=1;i<sorted.length;i++){
  const gap=sorted[i].bounds[axis]-end;if(gap*pixels>=4&&(gap>largest+1e-6/pixels||(Math.abs(gap-largest)*pixels<=1e-6&&Math.abs(i-sorted.length/2)<Math.abs(cut-sorted.length/2)))){largest=gap;cut=i}
  end=Math.max(end,sorted[i].bounds[axis]+sorted[i].bounds[size]);
 }
 return cut?{first:sorted.slice(0,cut),second:sorted.slice(cut)}:undefined;
}
function regionOrder(lines:OcrLine[],direction:'rtl'|'ltr',width:number,height:number):OcrLine[]{
 const stack=[lines],out:OcrLine[]=[];let work=0;
 while(stack.length){
  const region=stack.pop()!;if(region.length<2){out.push(...region);continue}
  const vertical=region.filter(l=>l.bounds.height*height>=l.bounds.width*width*1.4).length>region.length/2;
  work+=region.length;
  const x=work<=40_000?gapCut(region,'x',width):undefined,y=work<=40_000?gapCut(region,'y',height):undefined,axis=vertical?(x?'x':y?'y':undefined):(y?'y':x?'x':undefined);
  if(axis){const cut=(axis==='x'?x:y)!;const reverse=axis==='x'&&direction==='rtl';stack.push(reverse?cut.first:cut.second,reverse?cut.second:cut.first);continue}
  // Without a whitespace separation, this is only a deterministic display hint, not bubble-level reading truth.
  out.push(...region.slice().sort((a,b)=>vertical?((direction==='rtl'?b.bounds.x-a.bounds.x:a.bounds.x-b.bounds.x)||a.bounds.y-b.bounds.y||(a.id<b.id?-1:a.id>b.id?1:0)):(a.bounds.y-b.bounds.y||(direction==='rtl'?b.bounds.x-a.bounds.x:a.bounds.x-b.bounds.x)||(a.id<b.id?-1:a.id>b.id?1:0))));
 }
 return out;
}
/** Geometry-only suggestion; callers validate cached geometry. No text joins or speaker attribution. */
export function suggestOcrOrder(lines:OcrLine[],panels:Panel[],direction:'rtl'|'ltr',width:number,height:number):OcrLine[]{
 if(lines.length>3000||![width,height].every(n=>Number.isFinite(n)&&n>0))throw Error('OCR排序数量或尺寸无效');
 const out:OcrLine[]=[],known=new Set<string>();
 for(const p of panels.slice().sort((a,b)=>a.order-b.order)){if(known.has(p.id))continue;known.add(p.id);out.push(...regionOrder(lines.filter(l=>l.panelId===p.id),direction,width,height))}
 out.push(...regionOrder(lines.filter(l=>!l.panelId||!known.has(l.panelId)),direction,width,height));return out;
}

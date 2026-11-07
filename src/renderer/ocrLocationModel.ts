import type {PageAsset,Rect} from '../shared/types';
import type {OcrLine,OcrDocument} from '../shared/ocr';
import {ocrForReading} from './ocrReadingModel';
import {effectivePanels} from './editorModel';
export function ocrLocation(page:PageAsset|undefined,lineId:string,doc:OcrDocument|null|undefined=page?.ocr):{line:OcrLine;full:Rect;detail:Rect;points:string}|null{
 if(!page||!Number.isInteger(page.width)||!Number.isInteger(page.height)||page.width<=0||page.height<=0)return null;
 const panels=effectivePanels(page);if(!panels.length)panels.push({id:'whole-page',order:1,x:0,y:0,width:1,height:1});
 const view=ocrForReading(page,panels,'page','','rtl',doc),matches=view.originalLines.filter(l=>l.id===lineId);if(view.state!=='ready'||matches.length!==1)return null;
 const line=matches[0],r=line.bounds,x=r.x*page.width,y=r.y*page.height,w=r.width*page.width,h=r.height*page.height;
 const px=Math.max(24,w*.5),py=Math.max(24,h*.2),left=Math.max(0,x-px),top=Math.max(0,y-py),right=Math.min(page.width,x+w+px),bottom=Math.min(page.height,y+h+py);
 return {line,full:{x:0,y:0,width:page.width,height:page.height},detail:{x:left,y:top,width:right-left,height:bottom-top},points:line.poly.map(([x,y])=>`${x*page.width},${y*page.height}`).join(' ')};
}

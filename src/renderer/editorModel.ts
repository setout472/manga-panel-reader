import type { Panel, Rect, PageAsset, ReadingProgress } from '../shared/types';
export type History = {past:Panel[][];present:Panel[];future:Panel[][]};
const clone=(p:Panel[])=>p.map(v=>({...v}));
export const ordered=(p:Panel[])=>p.map((v,i)=>({...v,order:i+1}));
export const effectivePanels=(p:PageAsset):Panel[]=>(p.override?.panels??p.analysis?.panels??[]).slice().sort((a,b)=>a.order-b.order);
export function clampRect(r:Rect):Rect{
 const width=Math.max(.01,Math.min(1,Number.isFinite(r.width)?r.width:.1));
 const height=Math.max(.01,Math.min(1,Number.isFinite(r.height)?r.height:.1));
 return {x:Math.max(0,Math.min(1-width,Number.isFinite(r.x)?r.x:0)),y:Math.max(0,Math.min(1-height,Number.isFinite(r.y)?r.y:0)),width,height};
}
export function createHistory(p:Panel[]):History{return {past:[],present:clone(p),future:[]};}
export function commitHistory(h:History,p:Panel[]):History{
 const next=ordered(p);
 return JSON.stringify(next)===JSON.stringify(h.present)?h:{past:[...h.past.slice(-49),clone(h.present)],present:clone(next),future:[]};
}
export function undoHistory(h:History):History{
 return !h.past.length?h:{past:h.past.slice(0,-1),present:clone(h.past.at(-1)!),future:[clone(h.present),...h.future]};
}
export function redoHistory(h:History):History{
 return !h.future.length?h:{past:[...h.past,clone(h.present)],present:clone(h.future[0]),future:h.future.slice(1)};
}
export function mergePanels(p:Panel[],ids:string[],id:string):Panel[]{
 const selected=p.filter(v=>ids.includes(v.id)); if(selected.length<2)return clone(p);
 const x=Math.min(...selected.map(v=>v.x)), y=Math.min(...selected.map(v=>v.y));
 const right=Math.max(...selected.map(v=>v.x+v.width)), bottom=Math.max(...selected.map(v=>v.y+v.height));
 const merged:Panel={id,order:1,x,y,width:right-x,height:bottom-y};
 const first=p.findIndex(v=>ids.includes(v.id));
 return ordered(p.flatMap((v,i)=>i===first?[merged]:ids.includes(v.id)?[]:[v]));
}
export function reorderPanel(p:Panel[],from:string,to:string):Panel[]{
 const source=p.findIndex(v=>v.id===from), target=p.findIndex(v=>v.id===to);
 if(source<0||target<0||source===target)return clone(p);
 const next=clone(p); const [item]=next.splice(source,1); next.splice(target,0,item); return ordered(next);
}
export function moveReading(pages:PageAsset[],p:ReadingProgress,step:1|-1):ReadingProgress{
 if(!pages.length)return p;
 const page=Math.max(0,Math.min(pages.length-1,p.page));
 if(p.mode==='page')return {...p,page:Math.max(0,Math.min(pages.length-1,page+step)),panel:0};
 const count=Math.max(1,effectivePanels(pages[page]).length), panel=Math.max(0,Math.min(count-1,p.panel));
 if(step>0){
  if(panel+1<count)return {...p,page,panel:panel+1};
  if(page+1<pages.length)return {...p,page:page+1,panel:0};
 }else{
  if(panel>0)return {...p,page,panel:panel-1};
  if(page>0)return {...p,page:page-1,panel:Math.max(0,effectivePanels(pages[page-1]).length-1)};
 }
 return {...p,page,panel};
}
export function panelCrop(p:PageAsset,progress:ReadingProgress):Rect{
 const rect=progress.mode==='panel'?effectivePanels(p)[progress.panel]:undefined;
 return rect?{x:rect.x*p.width,y:rect.y*p.height,width:rect.width*p.width,height:rect.height*p.height}:{x:0,y:0,width:p.width,height:p.height};
}

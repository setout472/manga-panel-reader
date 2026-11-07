import type {Panel,Rect} from '../shared/types';
import {orderPanelFrames} from './panelReadingOrder';
import {buildReadingCrops} from './readingCrop';
export const RTDETR_ADAPTER_VERSION='rtdetr-original-group2-crop1';
type Detection=Rect&{confidence:number;classId:number;index:number};
function intersection(a:Rect,b:Rect){return Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))}
/** Separate adapter: RT-DETR uses original-pixel xyxy, NOT YOLO letterbox output. */
export function decodeRtdetrDetections(labels:readonly number[],boxes:readonly number[],scores:readonly number[],width:number,height:number,direction:'rtl'|'ltr',threshold=.5){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||width*height>80_000_000||!['rtl','ltr'].includes(direction)||!Number.isFinite(threshold)||threshold<0||threshold>1||labels.length>1000||scores.length!==labels.length||boxes.length!==labels.length*4)throw Error('RT-DETR 输出或原图尺寸无效');
 const all:Detection[]=[];
 for(let i=0;i<labels.length;i++){const cls=labels[i],score=scores[i],[l,t,r,b]=boxes.slice(i*4,i*4+4);if(![cls,score,l,t,r,b].every(Number.isFinite)||![0,1,2].includes(cls)||score<threshold||score>1||r<=l||b<=t)continue;const x=Math.max(0,Math.min(1,l/width)),y=Math.max(0,Math.min(1,t/height)),right=Math.max(0,Math.min(1,r/width)),bottom=Math.max(0,Math.min(1,b/height));if(right-x<.005||bottom-y<.005)continue;all.push({x,y,width:right-x,height:bottom-y,confidence:score,classId:cls,index:i})}
 const kept:Detection[]=[];for(const d of all.sort((a,b)=>b.confidence-a.confidence)){if(kept.some(k=>{if(k.classId!==d.classId)return false;const area=intersection(k,d);return area/(k.width*k.height+d.width*d.height-area)>.65}))continue;kept.push(d)}
 const ordered=orderPanelFrames(kept.filter(d=>d.classId===2).map(d=>({...d,id:'rtdetr-frame-'+d.index})),direction),panels:Panel[]=ordered.panels.map((d,i)=>({id:'rtdetr-frame-'+d.index,order:i+1,x:d.x,y:d.y,width:d.width,height:d.height})),regions=(cls:number)=>kept.filter(d=>d.classId===cls).map(({x,y,width,height,confidence})=>({x,y,width,height,confidence}));
 const textRegions=regions(1),bodyRegions=regions(0),reading=buildReadingCrops(panels,textRegions,bodyRegions);
 return {panels,readingPanels:reading.panels,textRegions,unassignedTextRegions:reading.unassignedTextRegions,bodyRegions,needsReview:true as const,orderUncertain:ordered.uncertain};
}

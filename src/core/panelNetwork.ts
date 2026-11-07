import type {Panel,Rect} from '../shared/types';
export function unletterboxDetections(data:Float32Array,dims:readonly number[],width:number,height:number,threshold=.35,size=1024){
 if(dims.length!==3||dims[0]!==1||dims[2]!==6||!Number.isSafeInteger(dims[1])||dims[1]<0||dims[1]>10000||dims[1]*6!==data.length||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!Number.isFinite(threshold)||threshold<0||threshold>1||!Number.isSafeInteger(size)||size<=0)throw Error('漫画检测器输出格式或尺寸不匹配');
 const scale=Math.min(size/width,size/height),resizedW=Math.round(width*scale),resizedH=Math.round(height*scale),padX=Math.floor((size-resizedW)/2),padY=Math.floor((size-resizedH)/2);
 const panels:Panel[]=[],textRegions:(Rect&{confidence:number})[]=[];
 const detections:(Rect&{confidence:number;cls:number})[]=[];
 for(let i=0;i<data.length;i+=6){
  const [left,top,right,bottom,confidence,cls]=Array.from(data.slice(i,i+6));
  if(![left,top,right,bottom,confidence,cls].every(Number.isFinite)||confidence<threshold||confidence>1||![0,1].includes(cls))continue;
  const x=Math.max(0,Math.min(1,(left-padX)/scale/width)),y=Math.max(0,Math.min(1,(top-padY)/scale/height)),r=Math.max(0,Math.min(1,(right-padX)/scale/width)),b=Math.max(0,Math.min(1,(bottom-padY)/scale/height));
  if(r-x<.005||b-y<.005)continue;
  const rect={x,y,width:r-x,height:b-y};
  detections.push({...rect,confidence,cls});
 }
 const kept:typeof detections=[];
 for(const d of detections.sort((a,b)=>b.confidence-a.confidence)){
  if(kept.some(k=>{
   if(k.cls!==d.cls)return false;
   const intersection=Math.max(0,Math.min(k.x+k.width,d.x+d.width)-Math.max(k.x,d.x))*Math.max(0,Math.min(k.y+k.height,d.y+d.height)-Math.max(k.y,d.y));
   return intersection/(k.width*k.height+d.width*d.height-intersection)>.65;
  }))continue;
  kept.push(d);
 }
 // Tentative row order only. Overlapping/spanning layouts are always reviewable.
 const sorted=kept.filter(d=>d.cls===0).sort((a,b)=>Math.abs(a.y-b.y)<.025?b.x-a.x:a.y-b.y);
 for(const d of sorted)panels.push({x:d.x,y:d.y,width:d.width,height:d.height,id:'network-panel-'+panels.length,order:panels.length+1});
 for(const d of kept.filter(d=>d.cls===1))textRegions.push({x:d.x,y:d.y,width:d.width,height:d.height,confidence:d.confidence});
 return {panels,textRegions,needsReview:true};
}

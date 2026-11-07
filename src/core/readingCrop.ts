import type {Panel,Rect} from '../shared/types';
export const READING_CROP_VERSION='reading-complete-v1';
const right=(r:Rect)=>r.x+r.width,bottom=(r:Rect)=>r.y+r.height;
const area=(r:Rect)=>r.width*r.height;
function overlap(a:Rect,b:Rect){return Math.max(0,Math.min(right(a),right(b))-Math.max(a.x,b.x))*Math.max(0,Math.min(bottom(a),bottom(b))-Math.max(a.y,b.y))}
function union(a:Rect,b:Rect):Rect{const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);return {x,y,width:Math.max(right(a),right(b))-x,height:Math.max(bottom(a),bottom(b))-y}}
function owner(frames:Panel[],r:Rect,min:number,lead:number){const ranks=frames.map((f,i)=>({i,score:overlap(f,r)/area(r)})).sort((a,b)=>b.score-a.score);return (ranks[0]?.score??-1)+1e-9>=min&&ranks[0].score-(ranks[1]?.score??0)+1e-9>=lead?ranks[0].i:-1}
/** Display crops only: never change detector boxes, reading order or semantic ownership. */
export function buildReadingCrops(frames:Panel[],texts:Rect[],bodies:Rect[]){
 const assigned=texts.map(t=>owner(frames,t,.5,.15));
 const required=frames.map(f=>({...f}));
 texts.forEach((t,i)=>{const k=assigned[i];if(k>=0)required[k]={...required[k],...union(required[k],t)}});
 const crops=required.map((r,i)=>{const f=frames[i],dx=Math.min(.018,f.width*.04),dy=Math.min(.018,f.height*.04);const x=Math.max(0,r.x-dx),y=Math.max(0,r.y-dy);return {...r,x,y,width:Math.min(1,right(r)+dx)-x,height:Math.min(1,bottom(r)+dy)-y}});
 for(const body of bodies){const k=owner(frames,body,.55,.3);if(k<0)continue;const f=frames[k],dx=Math.min(.08,f.width*.15),dy=Math.min(.08,f.height*.35);
  // All-or-nothing body inclusion: extreme spillover is not a license to show the entire page.
  if(body.x<f.x-dx||right(body)>right(f)+dx||body.y<f.y-dy||bottom(body)>bottom(f)+dy)continue;
  crops[k]={...crops[k],...union(crops[k],body)};
 }
 // Do not pull a neighboring panel's uniquely assigned dialogue into new margins.
 // Required content (original frame + its own dialogue) is never shrunk.
 for(let i=0;i<crops.length;i++){const r=required[i];let x=crops[i].x,y=crops[i].y,endX=right(crops[i]),endY=bottom(crops[i]);
  texts.forEach((t,j)=>{if(assigned[j]<0||assigned[j]===i)return;
   const vertical=Math.min(endY,bottom(t))>Math.max(y,t.y),horizontal=Math.min(endX,right(t))>Math.max(x,t.x);
   if(vertical&&t.x>=right(r))endX=Math.min(endX,Math.max(right(r),t.x-.002));
   if(vertical&&right(t)<=r.x)x=Math.max(x,Math.min(r.x,right(t)+.002));
   if(horizontal&&t.y>=bottom(r))endY=Math.min(endY,Math.max(bottom(r),t.y-.002));
   if(horizontal&&bottom(t)<=r.y)y=Math.max(y,Math.min(r.y,bottom(t)+.002));
  });
  crops[i]={...crops[i],x,y,width:endX-x,height:endY-y};
 }
 return {panels:crops,unassignedTextRegions:texts.filter((_,i)=>assigned[i]<0)};
}

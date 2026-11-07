import type {Rect} from '../shared/types';

type Frame=Rect&{id:string};
type Axis='x'|'y';
type Direction='rtl'|'ltr';
type Ordered<T>={panels:T[];uncertain:boolean};

// Coordinates are normalized to the page, not to the current recursive group.
const PAGE_OVERLAP_LIMIT=.008;
const FRAME_OVERLAP_RATIO=.025;
const FALLBACK_TOP_BAND=.025;

function compareFrames(a:Frame,b:Frame,direction:Direction):number{
 return a.y-b.y || (direction==='rtl'?b.x-a.x:a.x-b.x) ||
  a.height-b.height || a.width-b.width || (a.id<b.id?-1:a.id>b.id?1:0);
}

function orderTopBands<T extends Frame>(frames:T[],direction:Direction):T[]{
 const sorted=[...frames].sort((a,b)=>compareFrames(a,b,direction));
 const panels:T[]=[];
 for(let start=0;start<sorted.length;){
  // Anchor once per band; do not extend it using each next panel's top.
  // This keeps a near-y chain from joining multiple rows or creating cycles.
  const limit=sorted[start].y+FALLBACK_TOP_BAND;
  let end=start+1;
  while(end<sorted.length && sorted[end].y<=limit)end++;
  const band=sorted.slice(start,end).sort((a,b)=>
   (direction==='rtl'?b.x-a.x:a.x-b.x) || compareFrames(a,b,direction));
  panels.push(...band);start=end;
 }
 return panels;
}

function partition<T extends Frame>(frames:T[],axis:Axis,tolerant:boolean,direction:Direction):[T[],T[]]|undefined{
 const extent=axis==='x'?'width':'height';
 const sorted=[...frames].sort((a,b)=>a[axis]-b[axis] || compareFrames(a,b,direction));
 let end=sorted[0][axis]+sorted[0][extent];
 for(let i=1;i<sorted.length;i++){
  const overlap=end-sorted[i][axis];
  if(overlap<=0)return [sorted.slice(0,i),sorted.slice(i)];
  if(tolerant && overlap<=PAGE_OVERLAP_LIMIT){
   // A cut must work for every frame across it. Checking only adjacent tops
   // would incorrectly split a tall frame spanning multiple shorter rows.
   let valid=true;
   for(let left=0;left<i && valid;left++){
    const a=sorted[left];
    for(let right=i;right<sorted.length;right++){
     const b=sorted[right],crossing=a[axis]+a[extent]-b[axis];
     if(crossing<=0)break;
     if(crossing>Math.min(PAGE_OVERLAP_LIMIT,a[extent]*FRAME_OVERLAP_RATIO,b[extent]*FRAME_OVERLAP_RATIO)){
      valid=false;break;
     }
    }
   }
   if(valid)return [sorted.slice(0,i),sorted.slice(i)];
  }
  end=Math.max(end,sorted[i][axis]+sorted[i][extent]);
 }
 return undefined;
}

function orderGroup<T extends Frame>(frames:T[],direction:Direction):Ordered<T>{
 if(frames.length<2)return {panels:frames,uncertain:false};
 // Exhaust exact separators first: full-width rows precede columns. Only
 // after both axes fail do we permit detector-sized overlaps for review.
 for(const tolerant of [false,true]){
  for(const axis of ['y','x'] as const){
   const groups=partition(frames,axis,tolerant,direction);
   if(!groups)continue;
   if(axis==='x' && direction==='rtl')groups.reverse();
   const first=orderGroup(groups[0],direction),second=orderGroup(groups[1],direction);
   return {panels:[...first.panels,...second.panels],uncertain:tolerant || first.uncertain || second.uncertain};
  }
 }
 // Nested/overlapping layouts have no unique geometric reading order. Keep
 // all IDs and use anchored top bands with a total order inside each band.
 // Bands are deterministic candidates, not semantic proof of reading order.
 return {panels:orderTopBands(frames,direction),uncertain:true};
}

/** Order valid page-normalized frames without modifying source geometry or IDs. */
export function orderPanelFrames<T extends Rect&{id:string}>(frames:T[],direction:'rtl'|'ltr'):{panels:T[];uncertain:boolean}{
 return orderGroup(frames.map(frame=>({...frame})),direction);
}

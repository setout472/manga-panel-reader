import sharp from 'sharp';
import {performance} from 'node:perf_hooks';
import type {Panel} from '../shared/types';

export const LOCAL_MODEL='local-gutters-v2';
type Box={x:number;y:number;w:number;h:number;edge:number};

/** CPU-only geometry, not semantic vision. Borderless/overlapping pages require review. */
export async function detectLocalPanels(bytes:Uint8Array,direction:'rtl'|'ltr'):Promise<{panels:Panel[];needsReview:boolean;durationMs:number}>{
 const started=performance.now();
 // Bound work and memory independently of the original resolution; never write the input.
 const {data,info}=await sharp(bytes,{limitInputPixels:80_000_000}).rotate().flatten({background:'#fff'}).resize({width:1000,height:1000,fit:'inside',withoutEnlargement:true}).greyscale().raw().toBuffer({resolveWithObject:true});
 const W=info.width,H=info.height,N=W*H;
 const ink=new Uint8Array(N),seen=new Uint8Array(N),queue=new Int32Array(N);
 for(let i=0;i<N;i++)ink[i]=data[i]<115?1:0;
 const boxes:Box[]=[];
 for(let seed=0;seed<N;seed++){
  if(!ink[seed]||seen[seed])continue;
  let head=0,tail=1,x0=W,y0=H,x1=0,y1=0;
  queue[0]=seed;seen[seed]=1;
  while(head<tail){
   const p=queue[head++],x=p%W,y=Math.floor(p/W);
   x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   // Eight-neighbour connectivity preserves thin diagonal panel borders.
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const nx=x+dx,ny=y+dy;
    if(nx<0||nx>=W||ny<0||ny>=H)continue;
    const q=ny*W+nx;if(ink[q]&&!seen[q]){seen[q]=1;queue[tail++]=q}
   }
  }
  const w=x1-x0+1,h=y1-y0+1;
  if(w<W*.13||h<H*.11||w*h<N*.035||tail<(w+h)*1.1)continue;
  // Fraction of rows/columns that have ink close to all four bounding edges.
  const band=Math.max(2,Math.round(Math.min(w,h)*.025));
  let left=0,right=0,top=0,bottom=0;
  for(let y=y0;y<=y1;y++){let l=false,r=false;for(let k=0;k<band;k++){l ||= !!ink[y*W+x0+k];r ||= !!ink[y*W+x1-k]}left+=+l;right+=+r}
  for(let x=x0;x<=x1;x++){let t=false,b=false;for(let k=0;k<band;k++){t ||= !!ink[(y0+k)*W+x];b ||= !!ink[(y1-k)*W+x]}top+=+t;bottom+=+b}
  const edge=Math.min(left/h,right/h,top/w,bottom/w);
  // Skewed outlines have weaker edge support, but still qualify as review candidates.
  if(edge>=.12)boxes.push({x:x0,y:y0,w,h,edge});
 }
 // A character/speech balloon inside a panel is not another panel.
 let candidates=boxes.filter((a,i)=>!boxes.some((b,j)=>i!==j&&b.x<=a.x&&b.y<=a.y&&b.x+b.w>=a.x+a.w&&b.y+b.h>=a.y+a.h&&b.w*b.h>a.w*a.h));
 let ambiguous=false;
 for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
  const a=candidates[i],b=candidates[j];const overlap=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  if(overlap>Math.min(a.w*a.h,b.w*b.h)*.08)ambiguous=true;
 }
 const coverage=candidates.reduce((sum,b)=>sum+b.w*b.h,0)/N;
 // Low coverage commonly means isolated artwork, not separate panels. Full page is lossless.
 if(candidates.length<2||candidates.length>16||coverage<.4||ambiguous)candidates=[];
 // Closed outlines may be joined by a balloon or a character crossing a border.
 // Try broad uninterrupted white gutters only when the component route failed.
 if(!candidates.length){
  function split(b:Box,depth:number):Box[]{
   if(depth>4)return [b];
   for(const horizontal of [true,false]){
    const length=horizontal?b.h:b.w,span=horizontal?b.w:b.h;
    const gaps:{start:number;end:number}[]=[];let start=-1;
    for(let k=0;k<=length;k++){
     let count=0;if(k<length)for(let j=0;j<span;j++){const x=horizontal?b.x+j:b.x+k,y=horizontal?b.y+k:b.y+j;if(data[y*W+x]<225)count++}
     const empty=k<length&&count<=span*.002;
     if(empty&&start<0)start=k;
     if(!empty&&start>=0){if(k-start>=Math.max(2,length*.005)&&start>length*.18&&k<length*.82)gaps.push({start,end:k});start=-1}
    }
    const gap=gaps.sort((a,b)=>(b.end-b.start)-(a.end-a.start))[0];if(!gap)continue;
    const cut=Math.floor((gap.start+gap.end)/2);
    const a={...b,w:horizontal?b.w:cut,h:horizontal?cut:b.h,edge:0};
    const c={...b,x:horizontal?b.x:b.x+cut,y:horizontal?b.y+cut:b.y,w:horizontal?b.w:b.w-cut,h:horizontal?b.h-cut:b.h,edge:0};
    if(Math.min(a.w*a.h,c.w*c.h)<N*.06)continue;
    return [...split(a,depth+1),...split(c,depth+1)];
   }
   return [b];
  }
  const pieces=split({x:0,y:0,w:W,h:H,edge:0},0);
  if(pieces.length>=2&&pieces.length<=12)candidates=pieces;
 }
 // Cluster by aligned top edge, then reading direction; spanning/irregular rows stay reviewable.
 candidates.sort((a,b)=>a.y-b.y);
 const rows:Box[][]=[];
 for(const box of candidates){const row=rows.find(r=>Math.abs(r[0].y-box.y)<Math.min(r[0].h,box.h)*.18);if(row)row.push(box);else rows.push([box])}
 const ordered=rows.flatMap(row=>row.sort((a,b)=>direction==='rtl'?b.x-a.x:a.x-b.x));
 const panels:Panel[]=ordered.length?ordered.map((b,i)=>({id:`panel-${i+1}`,order:i+1,x:b.x/W,y:b.y/H,width:b.w/W,height:b.h/H})):[{id:'panel-1',order:1,x:0,y:0,width:1,height:1}];
 return {panels,needsReview:!ordered.length||ordered.some(b=>b.edge<.8)||coverage<.65,durationMs:Math.round((performance.now()-started)*100)/100};
}

export type GutterBox={x:number;y:number;w:number;h:number};
type Cut={horizontal:boolean;position:number;start:number;end:number;beforeSupport:number;afterSupport:number};
/** Experimental geometry only. Narrow intrusions are allowed; no semantic claims. */
export function findPartialGutters(data:Uint8Array,W:number,H:number){
 if(!(data instanceof Uint8Array)||![W,H].every(n=>Number.isSafeInteger(n)&&n>0&&n<=1000)||W*H>1_000_000||data.length!==W*H)throw Error('灰度输入尺寸无效');
 const cuts:Cut[]=[],MAX_WORK=8_000_000;let work=0,budgetLimited=false;
 function split(b:GutterBox,depth:number):GutterBox[]{
  if(depth>=4||cuts.length>=11||b.w<32||b.h<32)return [b];
  for(const horizontal of [true,false]){
   const length=horizontal?b.h:b.w,span=horizontal?b.w:b.h;
   if(work+length*span>MAX_WORK){budgetLimited=true;return [b]}
   const rows:{nonwhite:number;support:number}[]=[];
   for(let k=0;k<length;k++){let nonwhite=0,run=0,supported=0;for(let j=0;j<span;j++){const x=horizontal?b.x+j:b.x+k,y=horizontal?b.y+k:b.y+j,value=data[y*W+x];work++;if(value<225)nonwhite++;if(value<115)run++;else{if(run>=span*.1)supported+=run;run=0}}if(run>=span*.1)supported+=run;rows.push({nonwhite:nonwhite/span,support:supported/span})}
   const candidates:Cut[]=[];let start=-1;const near=Math.max(6,Math.round(length*.06));
   for(let k=0;k<=length;k++){
    if(k<length&&rows[k].nonwhite<=.04){if(start<0)start=k;continue}
    if(start<0)continue;const end=k;
    if(end-start>=Math.max(4,Math.ceil(length*.005))&&end-start<=length*.12&&start>length*.18&&end<length*.82){
     const beforeSupport=Math.max(0,...rows.slice(Math.max(0,start-near),start).map(r=>r.support)),afterSupport=Math.max(0,...rows.slice(end,Math.min(length,end+near)).map(r=>r.support));
     if(Math.min(beforeSupport,afterSupport)>=.4&&Math.max(beforeSupport,afterSupport)>=.6)candidates.push({horizontal,position:Math.floor((start+end)/2),start,end,beforeSupport,afterSupport});
    }start=-1;
   }
   candidates.sort((a,c)=>(c.end-c.start)-(a.end-a.start));
   for(const gap of candidates){const cut=gap.position,a={...b,w:horizontal?b.w:cut,h:horizontal?cut:b.h},c={...b,x:horizontal?b.x:b.x+cut,y:horizontal?b.y+cut:b.y,w:horizontal?b.w:b.w-cut,h:horizontal?b.h-cut:b.h};
    if(Math.min(a.w*a.h,c.w*c.h)<W*H*.06||Math.min(a.w,c.w)<W*.13||Math.min(a.h,c.h)<H*.11)continue;
    cuts.push({...gap,position:gap.position+(horizontal?b.y:b.x),start:gap.start+(horizontal?b.y:b.x),end:gap.end+(horizontal?b.y:b.x)});
    return [...split(a,depth+1),...split(c,depth+1)];
   }
  }return [b];
 }
 const pieces=split({x:0,y:0,w:W,h:H},0),padding=Math.max(1,Math.round(Math.min(W,H)*.012));
 // Retain a small overlapping context around cuts; still review large overhangs.
 const boxes=pieces.map(b=>{const x=Math.max(0,b.x-padding),y=Math.max(0,b.y-padding),right=Math.min(W,b.x+b.w+padding),bottom=Math.min(H,b.y+b.h+padding);return {x,y,w:right-x,h:bottom-y}});
 return {boxes,cuts,work,budgetLimited};
}

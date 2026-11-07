import type {Panel} from '../shared/types';import {validatePanels} from './panels';
function validated(value:unknown,empty=false):Panel[]{if(empty&&Array.isArray(value)&&value.length===0)return [];if(!Array.isArray(value)||value.length>100||value.some(p=>!p||typeof p.id!=='string'||!/^[-\w]{1,80}$/.test(p.id)))throw Error('评测画格ID无效');const panels=validatePanels(value);if(panels.some(p=>!Number.isFinite(p.width*p.height)||p.width*p.height<=0||p.x+p.width<=p.x||p.y+p.height<=p.y))throw Error('评测画格面积退化');return panels}
function iou(a:Panel,b:Panel){const area=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));return area/(a.width*a.height+b.width*b.height-area)}
/** Hungarian assignment: threshold-match count first, then total IoU. No order bonus. */
function assignment(scores:number[][]){
 const n=scores.length,u=new Array(n+1).fill(0),v=new Array(n+1).fill(0),p=new Array(n+1).fill(0),way=new Array(n+1).fill(0);
 for(let i=1;i<=n;i++){p[0]=i;let j0=0;const min=new Array(n+1).fill(Infinity),used=new Array(n+1).fill(false);
  do{used[j0]=true;const i0=p[j0];let delta=Infinity,j1=0;for(let j=1;j<=n;j++)if(!used[j]){const cur=-scores[i0-1][j-1]-u[i0]-v[j];if(cur<min[j]){min[j]=cur;way[j]=j0}if(min[j]<delta){delta=min[j];j1=j}}
   for(let j=0;j<=n;j++){if(used[j]){u[p[j]]+=delta;v[j]-=delta}else min[j]-=delta}j0=j1;
  }while(p[j0]!==0);
  do{const j1=way[j0];p[j0]=p[j1];j0=j1}while(j0!==0);
 }
 const columns=new Array<number>(n);for(let j=1;j<=n;j++)columns[p[j]-1]=j-1;return columns;
}
export function evaluatePanelLayout(prediction:unknown,reference:unknown){
 const pred=validated(prediction,true),ref=validated(reference),n=Math.max(pred.length,ref.length),matrix=Array.from({length:n},(_,p)=>Array.from({length:n},(_,r)=>p<pred.length&&r<ref.length?iou(pred[p],ref[r]):0)),scores=matrix.map(row=>row.map(x=>(x>=.8?n+1:0)+x)),columns=assignment(scores),matches=columns.flatMap((r,p)=>p<pred.length&&r<ref.length?[{p,r,iou:matrix[p][r]}]:[]);
 const countCorrect=pred.length===ref.length,orderCorrect=matches.length?matches.every((m,i)=>i===0||m.r>matches[i-1].r):null,matchedPanelsIoU80=matches.length>0&&matches.every(m=>m.iou>=.8),allPanelsIoU80=countCorrect&&matchedPanelsIoU80;
 return {meanIoU:matches.reduce((s,m)=>s+m.iou,0)/n,countCorrect,orderCorrect,matchedPanelsIoU80,allPanelsIoU80,pagePass:!!(countCorrect&&orderCorrect&&allPanelsIoU80),missing:Math.max(0,ref.length-pred.length),extra:Math.max(0,pred.length-ref.length),matches};
}
/** Evidence admission only; caller provenance is a declaration, not authentication. */
export function assessPanelAcceptance(input:unknown){
 const counts={regular:0,irregular:0,splash:0,spread:0},hashes=new Set<string>();let excluded=0,duplicates=0,regularPassed=0;
 if(!Array.isArray(input))throw Error('评测样本应为数组');
 for(const sample of input){if(!sample||typeof sample.hash!=='string'||!/^([a-f0-9]{64})$/i.test(sample.hash)||sample.provenance!=='human-independent'||typeof sample.category!=='string'||!Object.hasOwn(counts,sample.category)||typeof sample.pagePass!=='boolean'){excluded++;continue}const hash=sample.hash.toLowerCase();if(hashes.has(hash)){duplicates++;excluded++;continue}hashes.add(hash);counts[sample.category as keyof typeof counts]++;if(sample.category==='regular'&&sample.pagePass)regularPassed++}
 const eligible=hashes.size,completeMatrix=counts.regular===10&&counts.irregular===6&&counts.splash===2&&counts.spread===2;
 // Admit exactly the planned 10 regular pages; don't hide difficult pages by
 // adding enough easy ones to report "8 / 10" on a larger, unselected corpus.
 const geometryTargetMet=completeMatrix&&counts.regular===10&&regularPassed>=8;
 return {eligible,excluded,duplicates,counts,regularPassed,completeMatrix,geometryTargetMet,manualReadingAccepted:false};
}

import type {PageAsset,Rect} from '../shared/types';import type {OcrDocument} from '../shared/ocr';import {validOcrDocumentForReading} from './ocrReadingModel';
export type OcrDifference={lineId:string;kind:'unchanged'|'added'|'changed'|'uncompared';baseLineId?:string;nearDuplicate:boolean};
type Counts={unchanged:number;added:number;changed:number;uncompared:number;nearDuplicate:number};
type Comparison={state:'ready'|'unavailable';tags:OcrDifference[];counts:Counts;missingBase:number;budgetLimited:boolean;work:{pairs:number;cells:number}};
const PAIRS=40_000,CELLS=20_000;
function samePosition(a:Rect,b:Rect){const area=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));return area/Math.min(a.width*a.height,b.width*b.height)>=.6}
function shortText(text:string){const chars=Array.from(text.normalize('NFKC').replace(/\s+/gu,''));return chars.length>=6&&chars.length<=256?chars:null}
// Banded edit distance; comparison-only normalization never changes displayed text.
function nearText(a:string[],b:string[],work:Comparison['work']):boolean|null{
 const limit=Math.max(1,Math.min(2,Math.floor(Math.min(a.length,b.length)*.15)));if(Math.abs(a.length-b.length)>limit)return false;if(a.join('')===b.join(''))return true;
 let previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const current=new Array<number>(b.length+1).fill(limit+1);current[0]=i;let best=limit+1;
  for(let j=Math.max(1,i-limit);j<=Math.min(b.length,i+limit);j++){if(work.cells>=CELLS)return null;work.cells++;current[j]=Math.min(previous[j]+1,current[j-1]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));best=Math.min(best,current[j])}
  if(best>limit)return false;previous=current;
 }
 return previous[b.length]<=limit;
}
/** Provenance/layout hints, not deduplication or evidence of transcription accuracy. */
export function compareOcrDocuments(page:PageAsset|undefined,candidate:OcrDocument|null|undefined):Comparison{
 const result:Comparison={state:'unavailable',tags:[],counts:{unchanged:0,added:0,changed:0,uncompared:0,nearDuplicate:0},missingBase:0,budgetLimited:false,work:{pairs:0,cells:0}},base=page?.ocr;
 if(!page||![page.width,page.height].every(n=>Number.isSafeInteger(n)&&n>0)||!validOcrDocumentForReading(page,base)||!validOcrDocumentForReading(page,candidate)||base.model!==candidate.model||[base,candidate].some(d=>d.lines.some(l=>!l.id.trim()||l.id.length>200))||new Set(base.lines.map(l=>l.id)).size!==base.lines.length||new Set(candidate.lines.map(l=>l.id)).size!==candidate.lines.length)return result;
 result.state='ready';const originals=new Map(base.lines.map(l=>[l.id,l])),candidateIds=new Set(candidate.lines.map(l=>l.id)),normalized=new Map<string,string[]|null>(),claimed=new Set(base.lines.filter(l=>candidateIds.has(l.id)).map(l=>l.id));
 for(const line of candidate.lines){
  const original=originals.get(line.id),tag:OcrDifference={lineId:line.id,kind:original?(original.text===line.text&&JSON.stringify(original.poly)===JSON.stringify(line.poly)?'unchanged':'changed'):'added',nearDuplicate:false};
  if(original)tag.baseLineId=original.id;
  else {
   const text=shortText(line.text);let hint:string|undefined;
   for(const raw of base.lines){
    if(result.work.pairs>=PAIRS||result.work.cells>=CELLS){tag.kind='uncompared';result.budgetLimited=true;break}result.work.pairs++;
    if(!samePosition(raw.bounds,line.bounds))continue;
    // Crop replacements change IDs/confidence/rectangles even for exact text.
    // Reserve original IDs first, then match exact transcription once only.
    if(raw.text===line.text&&!claimed.has(raw.id)){tag.kind='unchanged';tag.baseLineId=raw.id;claimed.add(raw.id);break}
    if(!text)continue;
    if(!normalized.has(raw.id))normalized.set(raw.id,shortText(raw.text));const other=normalized.get(raw.id);if(!other)continue;
    const near=nearText(text,other,result.work);if(near===null){tag.kind='uncompared';result.budgetLimited=true;break}
    if(near&&!hint)hint=raw.id;
   }
   if(tag.kind==='added'&&hint){tag.nearDuplicate=true;tag.baseLineId=hint}
  }
  result.tags.push(tag);result.counts[tag.kind]++;if(tag.nearDuplicate)result.counts.nearDuplicate++;
 }
 result.missingBase=base.lines.filter(l=>!claimed.has(l.id)).length;return result;
}

import {createHash} from 'node:crypto';
import type {PageContent,PanelRef} from '../shared/story';

export const CONTINUITY_VERSION='identity-candidates-v1';
export type CharacterMention={id:string;ref:PanelRef;characterIndex:number;pageIndex:number;label:string;traits:string[]};
export type IdentityCandidate={id:string;left:string;right:string;reasons:string[];status:'pending'};
export type IdentityLedger={version:string;sourceKey:string;mentions:CharacterMention[];candidates:IdentityCandidate[]};
export type IdentityReview={sourceKey:string;decisions:{candidateId:string;status:'accepted'|'rejected'}[]};
export type IdentityState={ledger:IdentityLedger;review:IdentityReview;identities:{id:string;mentionIds:string[];status:'unresolved'|'reviewed'}[];pending:IdentityCandidate[]};
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(message:string):never=>{throw new Error(message)};
const text=(v:unknown,max:number)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail('人物来源字段无效');return v as string};
const normalized=(label:string)=>label.replace(/髮/g,'发').replace(/頭/g,'头').replace(/長/g,'长').replace(/鬍/g,'胡').replace(/鬚/g,'须');
function traits(label:string):string[]{
 const s=normalized(label),out:string[]=[];
 if(/黑.{0,1}发|深色.{0,2}发/.test(s))out.push('深色头发');
 if(/长.{0,2}发/.test(s))out.push('长发');
 if(/短.{0,2}发/.test(s))out.push('短发');
 if(/胡[子渣须]/.test(s)&&!/(无|無|没有|沒).*胡/.test(s))out.push('胡须');
 return out;
}
const samePanel=(a:CharacterMention,b:CharacterMention)=>a.ref.pageId===b.ref.pageId&&a.ref.panelId===b.ref.panelId;
function conflict(a:CharacterMention,b:CharacterMention):boolean{
 const sex=(s:string)=>/女|少女/.test(s)?'female':/男/.test(s)?'male':undefined;
 const sa=sex(a.label),sb=sex(b.label);
 return Boolean(sa&&sb&&sa!==sb)||(a.traits.includes('长发')&&b.traits.includes('短发'))||(a.traits.includes('短发')&&b.traits.includes('长发'));
}

/** Textual hints, not visual identity recognition. Even identical labels are never auto-merged. */
export function buildContinuity(contents:PageContent[]):IdentityLedger{
 if(!Array.isArray(contents)||contents.length>20)fail('人物来源最多 20 页');
 const pageIds=new Set<string>(),mentions:CharacterMention[]=[];
 for(const [pageIndex,page] of contents.entries()){
  text(page.pageId,80);text(page.sourceKey,200);
  if(pageIds.has(page.pageId))fail('人物来源页重复');pageIds.add(page.pageId);
  if(!Array.isArray(page.panels)||page.panels.length>100)fail('人物来源画格超限');
  const panelIds=new Set<string>();
  for(const panel of page.panels){
   text(panel.panelId,80);if(panelIds.has(panel.panelId))fail('人物来源格重复');panelIds.add(panel.panelId);
   if(!Array.isArray(panel.characters)||panel.characters.length>30)fail('人物来源数量超限');
   for(const [characterIndex,label] of panel.characters.entries()){
    text(label,300);if(mentions.length>=600)fail('人物提及总量超限');
    const ref={pageId:page.pageId,panelId:panel.panelId};
    mentions.push({id:'mention-'+digest([ref,characterIndex,label]),ref,characterIndex,pageIndex,label,traits:traits(label)});
   }
  }
 }
 const candidates:IdentityCandidate[]=[];
 for(let i=0;i<mentions.length;i++)for(let j=i+1;j<mentions.length;j++){
  const a=mentions[i],b=mentions[j];
  if(samePanel(a,b)||Math.abs(a.pageIndex-b.pageIndex)>2||conflict(a,b))continue;
  const shared=a.traits.filter(t=>b.traits.includes(t));if(!shared.length)continue;
  candidates.push({id:'link-'+digest([a.id,b.id]),left:a.id,right:b.id,reasons:shared.map(t=>`共有外观词：${t}`),status:'pending'});
 }
 // Fact changes invalidate review decisions, even if an upstream sourceKey was accidentally reused.
 const sourceKey=digest([CONTINUITY_VERSION,contents.map(p=>[p.pageId,p.sourceKey,p.panels,p.summary,p.needsReview])]);
 return {version:CONTINUITY_VERSION,sourceKey,mentions,candidates};
}

export function applyIdentityReview(ledger:IdentityLedger,review:IdentityReview={sourceKey:ledger.sourceKey,decisions:[]}):IdentityState{
 if(review.sourceKey!==ledger.sourceKey)fail('人物来源已变化，请重新复核');
 if(!Array.isArray(review.decisions)||review.decisions.length>ledger.candidates.length)fail('人物关联决定重复或超限');
 const edges=new Map(ledger.candidates.map(e=>[e.id,e])),decisions=new Map<string,'accepted'|'rejected'>();
 const parent=new Map(ledger.mentions.map(m=>[m.id,m.id]));
 function root(id:string):string{let r=id;while(parent.get(r)!==r)r=parent.get(r)!;return r}
 for(const decision of review.decisions){
  const edge=edges.get(decision.candidateId);if(!edge||!['accepted','rejected'].includes(decision.status))fail('人物关联决定无效');
  if(decisions.has(decision.candidateId))fail('人物关联决定重复');decisions.set(decision.candidateId,decision.status);
  if(decision.status==='accepted')parent.set(root(edge!.right),root(edge!.left));
 }
 for(const [id,status] of decisions){const edge=edges.get(id)!;if(status==='rejected'&&root(edge.left)===root(edge.right))fail('人物关联与否定决定冲突');}
 const groups=new Map<string,CharacterMention[]>();
 for(const mention of ledger.mentions){const key=root(mention.id),group=groups.get(key)||[];group.push(mention);groups.set(key,group)}
 for(const group of groups.values())for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
  if(samePanel(group[i],group[j]))fail('同格不同人物提及禁止自动归为同一角色');
  if(conflict(group[i],group[j]))fail('人物外观关联存在冲突');
 }
 const identities=[...groups.values()].map(group=>({id:'character-'+digest(group.map(m=>m.id).sort()),mentionIds:group.map(m=>m.id),status:group.length>1?'reviewed' as const:'unresolved' as const}));
 return structuredClone({ledger,review,identities,pending:ledger.candidates.filter(e=>!decisions.has(e.id))});
}

/** Future synthesis input: keep raw facts distinct from reviewed identities and unresolved hints. */
export function continuityContext(contents:PageContent[],state:IdentityState){
 if(buildContinuity(contents).sourceKey!==state.ledger.sourceKey)fail('人物来源已变化，请重新复核');
 const checked=applyIdentityReview(buildContinuity(contents),state.review);
 return structuredClone({facts:contents,confirmedCharacters:checked.identities.filter(i=>i.status==='reviewed').map(i=>({id:i.id,appearances:checked.ledger.mentions.filter(m=>i.mentionIds.includes(m.id))})),pendingIdentityHints:checked.pending,identitySourceKey:checked.ledger.sourceKey});
}

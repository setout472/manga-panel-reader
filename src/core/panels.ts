import type {Panel} from '../shared/types';
import {createHash} from 'node:crypto';
export const PROMPT_VERSION='panel-rect-v1';
export function validatePanels(value:unknown):Panel[] {
 if(!Array.isArray(value)||value.length===0||value.length>100)throw Error('画格数量应为 1～100');
 const result=value.map((p:any)=>{
  if(!p||!['x','y','width','height','order'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])))throw Error('画格字段应为有效数字');
  if(p.x<0||p.y<0||p.width<=0||p.height<=0||p.x+p.width>1.000001||p.y+p.height>1.000001||!Number.isInteger(p.order)||p.order<1)throw Error('画格边界或顺序无效');
  const id=typeof p.id==='string'&&/^[\w-]{1,80}$/.test(p.id)?p.id:`panel-${p.order}`;
  return {id,x:p.x,y:p.y,width:p.width,height:p.height,order:p.order} as Panel;
 }).sort((a,b)=>a.order-b.order);
 if(new Set(result.map(x=>x.id)).size!==result.length||result.some((p,i)=>p.order!==i+1))throw Error('画格顺序或标识重复／不连续');
 return result;
}
export function analysisKey(hash:string,model:string,baseUrl:string,side:number,direction:string):string {
 return createHash('sha256').update(JSON.stringify([PROMPT_VERSION,hash,model,baseUrl.replace(/\/$/,''),side,direction])).digest('hex');
}
export function validateChapterUrl(value:string):string {
 const u=new URL(value);
 if(u.protocol!=='https:'||!['www.copy4000.com','copy4000.com'].includes(u.hostname)||u.port||u.username||u.password||!/^\/comic\/[a-zA-Z0-9_-]+\/chapter\/[a-zA-Z0-9-]+\/?$/.test(u.pathname))throw Error('请输入 copy4000.com 的漫画章节链接');
 u.hash='';u.search='';return u.href;
}
export function normalizeImageCandidates(items:{src?:string;lazy?:string}[]):string[] {
 const out=new Set<string>();
 for(const item of items){try{const u=new URL(item.lazy||item.src||'');if(u.protocol!=='https:'||u.username||u.password||u.port)continue;if(!(u.hostname==='mangafunb.fun'||u.hostname.endsWith('.mangafunb.fun')))continue;if(/\/static\/|loading|\/ads\//i.test(u.pathname))continue;out.add(u.href)}catch{}}
 return [...out];
}

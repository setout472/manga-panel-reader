import {mkdirSync,readFileSync,writeFileSync,renameSync,copyFileSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type {ChapterManifest,PageAsset,Analysis} from '../shared/types';
export const sha=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
export function atomicJson(path:string,value:unknown,backup=true){
 const tmp=path+'.tmp-'+randomUUID();
 writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');
 if(backup&&existsSync(path))copyFileSync(path,path+'.bak');
 renameSync(tmp,path);
}
export class Library {
 constructor(public root:string){mkdirSync(root,{recursive:true});mkdirSync(join(root,'cache'),{recursive:true})}
 private valid(id:string){if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw Error('无效的资料标识');return id}
 chapterDir(id:string){return join(this.root,this.valid(id))}
 manifestPath(id:string){return join(this.chapterDir(id),'chapter.json')}
 create(source:ChapterManifest['source'],title:string,id:string=randomUUID(),sourceUrl?:string):ChapterManifest{
  if(existsSync(this.manifestPath(id)))return this.get(id);
  mkdirSync(join(this.chapterDir(id),'pages'),{recursive:true});
  const now=new Date().toISOString();
  const c:ChapterManifest={id,title:title.slice(0,300),source,sourceUrl,pages:[],collectionStatus:'idle',createdAt:now,updatedAt:now,progress:{page:0,panel:0,mode:'page',zoom:1},direction:'rtl'};
  atomicJson(this.manifestPath(id),c);return c;
 }
 get(id:string):ChapterManifest{
  const path=this.manifestPath(id);
  const read=(p:string)=>{const x=JSON.parse(readFileSync(p,'utf8'));if(x.id!==id||!Array.isArray(x.pages)||!x.progress||typeof x.title!=='string')throw Error('章节记录无效');return x as ChapterManifest};
  try{return read(path)}catch(e){if(existsSync(path+'.bak')){const x=read(path+'.bak');atomicJson(path,x,false);return x}throw e}
 }
 list(){return readdirSync(this.root,{withFileTypes:true}).filter(x=>x.isDirectory()&&x.name!=='cache').flatMap(x=>{try{return [this.get(x.name)]}catch{return []}}).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}
 update(id:string,fn:(c:ChapterManifest)=>void){const c=this.get(id);fn(c);c.updatedAt=new Date().toISOString();atomicJson(this.manifestPath(id),c);return c}
 pagePath(chapterId:string,pageId:string){const p=this.get(chapterId).pages.find(x=>x.id===pageId);if(!p||!/^pages\/[\w.-]+$/.test(p.file))throw Error('页面不存在');return join(this.chapterDir(chapterId),p.file)}
 addPage(id:string,index:number,data:Uint8Array,width:number,height:number,remoteUrl?:string):ChapterManifest{
  if(!Number.isInteger(index)||index<0||index>10000||!width||!height)throw Error('无效的图片页');
  const hash=sha(data),pageId=`p-${index}-${hash.slice(0,12)}`;
  const extension=data[0]===255&&data[1]===216?'jpg':data[0]===137&&data[1]===80?'png':'webp';
  const file=`pages/${pageId}.${extension}`;
  writeFileSync(join(this.chapterDir(id),file),data);
  return this.update(id,c=>{const old=c.pages.find(x=>x.index===index);if(old?.hash===hash){old.remoteUrl=remoteUrl;return}const page:PageAsset={id:pageId,index,hash,file,width,height,remoteUrl,status:'ready'};c.pages=c.pages.filter(x=>x.index!==index);c.pages.push(page);c.pages.sort((a,b)=>a.index-b.index)})
 }
 cached(key:string):Analysis|undefined{if(!/^[a-f0-9]{64}$/.test(key))return;try{return JSON.parse(readFileSync(join(this.root,'cache',key+'.json'),'utf8'))}catch{return}}
 cache(value:Analysis){if(!/^[a-f0-9]{64}$/.test(value.cacheKey))throw Error('缓存标识无效');atomicJson(join(this.root,'cache',value.cacheKey+'.json'),value,false)}
}

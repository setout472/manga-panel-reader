import {BrowserWindow} from 'electron';
import {imageInfo} from './images';
import {normalizeImageCandidates,validateChapterUrl} from '../core/panels';
import type {Library} from './library';
import type {JobControl} from './jobs';
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export const SOURCE_SNAPSHOT=`(()=>{
 const images=[...document.querySelectorAll('.comicContent-list img')].filter(i=>!/[\\/]ads[\\/]/i.test(i.getAttribute('data-src')||i.src||'')).map((i,index)=>({index,src:i.currentSrc||i.src,lazy:i.getAttribute('data-src')||undefined}));
 const count=document.querySelector('.comicCount')?.textContent||'';
 const heading=document.querySelector('h4')?.textContent||document.title;
 return {images,total:Number(count.replace(/[^0-9]/g,''))||0,title:heading,challenge:!images.length&&/captcha|验证|驗證|verify you are human|登录后阅读|登錄後閱讀/i.test(document.body.innerText)};
})()`;
export class CopySource {
 private windows=new Map<string,BrowserWindow>();
 async show(id:string,url:string){const w=this.window(id);w.show();w.focus();if(!w.webContents.getURL())await w.loadURL(validateChapterUrl(url))}
 closeAll(){for(const w of this.windows.values())if(!w.isDestroyed())w.destroy();this.windows.clear()}
 private window(id:string){
  let win=this.windows.get(id);
  if(!win||win.isDestroyed()){
   win=new BrowserWindow({show:false,width:1100,height:820,title:'拷贝漫画 · 来源窗口',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,partition:'persist:copy-source'}});
   win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
   win.webContents.on('will-navigate',(e,target)=>{try{if(!['www.copy4000.com','copy4000.com'].includes(new URL(target).hostname))e.preventDefault()}catch{e.preventDefault()}});
   this.windows.set(id,win);
  }
  return win;
 }
 async collect(library:Library,id:string,control:JobControl,onChange:()=>void){
  const c=library.get(id),url=validateChapterUrl(c.sourceUrl||'');
  const view=this.window(id);
  try{
   library.update(id,x=>{x.collectionStatus='running';x.message='正在打开章节阅读器'});onChange();
   await view.loadURL(url);
   const slots=new Map<number,string>();let expected=0;let unchanged=0;
   for(let step=0;step<10000;step++){
    await control.ready();if(view.isDestroyed())throw Error('来源窗口已关闭');
    const snapshot=await view.webContents.executeJavaScript(SOURCE_SNAPSHOT);
    if(snapshot.total>0&&snapshot.total<=10000)expected=snapshot.total;
    if(snapshot.challenge){control.set('paused','请在来源窗口完成登录或验证，然后点击继续');library.update(id,x=>{x.collectionStatus='paused';x.message=control.job.message});onChange();view.show();await control.ready();continue}
    let added=0;
    for(const item of snapshot.images||[]){const u=normalizeImageCandidates([item])[0];if(!u)continue;const index=item.index;if(!Number.isInteger(index)||index<0||index>=10000)throw Error('来源页序无效');const previous=slots.get(index);if(previous&&previous!==u)throw Error('来源页面顺序发生变化，已停止以避免错序');if(!previous){slots.set(index,u);added++}}
    const ordered=[...slots.entries()].sort((a,b)=>a[0]-b[0]).map(([index,u])=>({index,u}));
    if(added){unchanged=0;library.update(id,x=>{x.title=String(snapshot.title||x.title).trim().slice(0,300);x.expectedPages=expected||undefined;x.message=`发现 ${ordered.length}${expected?' / '+expected:''} 页`});onChange()}
    else unchanged++;
    // Download each newly discovered page in source order, at most two in flight.
    const known=library.get(id).pages;
    const missing=ordered.filter(x=>!known.some(p=>p.index===x.index&&p.remoteUrl===x.u));
    for(let start=0;start<missing.length;start+=2){await control.ready();const batch=await Promise.allSettled(missing.slice(start,start+2).map(async({u,index})=>{
     let error:unknown;
     for(let attempt=0;attempt<3;attempt++){
      await control.ready();
      try{
       const res=await view.webContents.session.fetch(u,{referrer:url,redirect:'error',signal:AbortSignal.any([control.abort.signal,AbortSignal.timeout(30000)])});
       if(!res.ok)throw Error(`图片请求 HTTP ${res.status}`);
       if(!/^image\//i.test(res.headers.get('content-type')||''))throw Error('图片响应格式异常');
       const data=Buffer.from(await res.arrayBuffer());if(data.length>30*1024*1024)throw Error('图片超过 30 MB');
       const {width,height}=await imageInfo(data);if(width<200||height<200)throw Error('图片尺寸异常');
       library.addPage(id,index,data,width,height,u);control.progress(library.get(id).pages.length,expected||ordered.length);onChange();return;
      }catch(e){control.abort.signal.throwIfAborted();error=e;if(attempt<2)await delay(1000*(attempt+1))}
     }
     throw error;
    }));const rejected=batch.find(x=>x.status==='rejected');if(rejected?.status==='rejected')throw rejected.reason;}
    if(expected&&ordered.length>=expected)break;
    if(unchanged>=40)break;
    // This reader appends pages only while scrolling within the upper part of
    // the current list. Returning to the top avoids permanently stalling at
    // the bottom. Only ordinary scrolling is used; page scripts render URLs.
    await view.webContents.executeJavaScript(`(()=>{const list=document.querySelector('.comicContent-list');const next=window.scrollY+Math.max(400,window.innerHeight*0.9);const limit=list?list.offsetTop+list.offsetHeight/3:document.documentElement.scrollHeight;window.scrollTo(0,next<limit?next:0)})()`);
    await delay(350);
   }
   await control.ready();
   const final=library.get(id);const complete=expected>0&&slots.size===expected&&final.pages.length===expected&&final.pages.every((p,i)=>p.index===i&&p.remoteUrl===slots.get(i));
   library.update(id,x=>{x.collectionStatus=complete?'complete':'incomplete';x.expectedPages=expected||undefined;x.message=complete?`已缓存全部 ${expected} 页`:`采集未完成：已缓存 ${x.pages.length}${expected?' / '+expected:''} 页，可继续采集`});
   control.set(complete?'done':'error',library.get(id).message);onChange();
  }catch(e){const cancelled=control.job.state==='cancelled';library.update(id,x=>{x.collectionStatus=cancelled?'cancelled':'incomplete';x.message=cancelled?'已取消，已下载页面保留':String((e as Error).message||'采集失败')});if(!cancelled)control.set('error',library.get(id).message);onChange()}
  finally{if(!view.isDestroyed())view.hide()}
 }
}


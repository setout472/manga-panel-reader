import {reflowPanelAnalysis,LEGACY_PANEL_MODEL} from './panelReflow';
import {transportIdentity} from '../core/wire';
import {app,BrowserWindow,ipcMain,dialog,protocol,net} from 'electron';
import {readFileSync,statSync,mkdirSync} from 'node:fs';
import {join,basename,dirname,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {Library,sha} from './library';
import {Preferences} from './settings';
import {CopySource} from './source';
import {JobControl} from './jobs';
import {imageInfo,analysisImage} from './images';
import {analysisKey,validatePanels,validateChapterUrl} from '../core/panels';
import {requestAnalysis,ApiError} from '../core/inference';
import {detectLocalPanels,LOCAL_MODEL} from './localPanels';
import {PanelRuntime,PanelResourceError} from './panelRuntime';import {PANEL_MODEL} from './panelAssets';
import {LocalRuntime} from './localRuntime';
import {OcrRuntime} from './ocrRuntime';
import {OcrJobs} from './ocrJobs';
import {refinementView} from './ocrRefinementView';
import {updateReadingNote} from '../core/readingNotes';
import {contentKey,storyKey,requestPageContent,requestStoryDraft} from '../core/story';
import type {PageContent} from '../shared/story';
const localRuntime=new LocalRuntime(app.isPackaged?join(dirname(process.execPath),'local-engine'):join(app.getAppPath(),'.runtime/local-engine'));
import type {Job,ChapterManifest,ReadingProgress} from '../shared/types';

protocol.registerSchemesAsPrivileged([{scheme:'manga',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
if(!app.isPackaged&&process.env.READER_DATA_DIR){const profile=join(process.env.READER_DATA_DIR,'.electron');mkdirSync(profile,{recursive:true});app.setPath('userData',profile)}
let mainWindow:BrowserWindow;
let library:Library;
let prefs:Preferences;
const ocrRuntime=new OcrRuntime(app.isPackaged?join(dirname(process.execPath),'ocr-engine'):join(app.getAppPath(),'.runtime/ocr-production'));
const panelRuntime=new PanelRuntime(app.isPackaged?join(dirname(process.execPath),'panel-engine'):(process.env.READER_PANEL_ASSETS||join(app.getAppPath(),'.runtime/panel-production')));
let ocrJobs:OcrJobs;
const source=new CopySource();
const jobs=new Map<string,JobControl>();
const pending=new Set<string>();
let selectedPdf:{name:string;hash:string}|undefined;
const idSchema=z.string().regex(/^[\w-]{1,80}$/);
const progressSchema=z.object({page:z.number().int().min(0).max(10000),panel:z.number().int().min(0).max(100),mode:z.enum(['page','panel']),zoom:z.number().min(.1).max(10)});
function emit(chapterId:string,job?:Job){if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('reader:update',{chapterId,job})}
function controller(id:string,kind:Job['kind'],total:number){const k=id+':'+kind;if(pending.has(k))throw Error('此任务仍在运行，请先暂停或等待结束');const c=new JobControl(id,kind,total,j=>{if(kind==='analyze')library.update(id,c=>{if(c.analysisTask){c.analysisTask.state=j.state;c.analysisTask.done=j.done;c.analysisTask.message=j.message}});emit(id,j)});jobs.set(k,c);return c}
function startCollection(id:string){
 const c=library.get(id);if(c.source!=='copy')throw Error('此章节不是网络来源');
 const control=controller(id,'collect',c.expectedPages||0);const k=id+':collect';pending.add(k);
 void source.collect(library,id,control,()=>emit(id)).finally(()=>pending.delete(k));
}
function startAnalysis(id:string,from:number,to:number,force=false,resume=false,engine:'local'|'cloud'='cloud'){
 const chapter=library.get(id);const settings=prefs.public();
 if(engine==='cloud'&&!prefs.key())throw Error('请先在设置中填写 API Key；整页阅读和手动分格可直接使用');
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to>=chapter.pages.length)throw Error('分析页码范围无效');
 if(pending.has(id+':story'))throw Error('内容解析正在使用画格，请等待结束');
 if(pending.has(id+':analyze'))throw Error('分析任务仍在运行');
 if(engine==='local'&&[...jobs.values()].some(j=>j.job.kind==='analyze'&&pending.has(j.job.chapterId+':analyze')&&library.get(j.job.chapterId).analysisTask?.engine==='local'))throw Error('已有本地分格任务，请先完成或取消');
 const specialist=engine==='local'&&panelRuntime.status().available;
 const selected=resume&&chapter.analysisTask?chapter.analysisTask.remainingPageIds.filter(pid=>chapter.pages.some(p=>p.id===pid)):chapter.pages.slice(from,to+1).map(x=>x.id);
 library.update(id,c=>{c.analysisTask={from,to,remainingPageIds:[...selected],force,engine,state:'running',total:selected.length,done:0}});
 const control=controller(id,'analyze',selected.length);const k=id+':analyze';pending.add(k);
 let cursor=0,finished=0,failed=0;
 async function work(){
  while(cursor<selected.length){
   await control.ready();if(cursor>=selected.length)return;const pageId=selected[cursor++];
   while(true){
    await control.ready();
    const current=library.get(id),page=current.pages.find(p=>p.id===pageId)!;
    const s=engine==='local'?{...prefs.public(),model:specialist?PANEL_MODEL:LOCAL_MODEL,baseUrl:'local:',maxImageSide:specialist?1280:1000,wireApi:'chat-completions' as const}:prefs.public(),key=analysisKey(page.hash,s.model,transportIdentity(s.baseUrl,s),s.maxImageSide,current.direction);
    const apiKey=engine==='local'?'':prefs.key();
    let cached=force?undefined:library.cached(key);
    if(!force&&!cached&&specialist){const legacyKey=analysisKey(page.hash,LEGACY_PANEL_MODEL,transportIdentity(s.baseUrl,s),s.maxImageSide,current.direction);cached=reflowPanelAnalysis(library.cached(legacyKey)??page.analysis,legacyKey,key,current.direction);if(cached)library.cache(cached)}
    try{
     if(cached){validatePanels(cached.panels);library.update(id,c=>{const p=c.pages.find(x=>x.id===pageId)!;if(!p.override&&JSON.stringify(p.analysis?.panels)!==JSON.stringify(cached.panels)){for(const later of c.pages)if(later.index>=p.index)delete later.content;if(c.story)c.storyStale=true}p.analysis=cached;p.status=cached.needsReview?'review':'done'})}
     else{
      library.update(id,c=>{c.pages.find(x=>x.id===pageId)!.status='analyzing'});emit(id);
      const raw=readFileSync(library.pagePath(id,pageId));
      const bytes=engine==='cloud'?await analysisImage(raw,s.maxImageSide):raw;
      const result=engine==='local'?{...(specialist?await panelRuntime.detect(raw,current.direction,control.abort.signal):{...await detectLocalPanels(raw,current.direction),model:LOCAL_MODEL}),cacheKey:key}:await requestAnalysis({image:bytes,mime:'image/jpeg',hash:page.hash,direction:current.direction,model:s.model,baseUrl:s.baseUrl,wireApi:s.wireApi,reasoningEffort:s.reasoningEffort,apiKey,maxImageSide:s.maxImageSide,signal:control.abort.signal});
      control.abort.signal.throwIfAborted();library.cache(result);library.update(id,c=>{const p=c.pages.find(x=>x.id===pageId)!;if(!p.override&&JSON.stringify(p.analysis?.panels)!==JSON.stringify(result.panels)){for(const later of c.pages)if(later.index>=p.index)delete later.content;if(c.story)c.storyStale=true}p.analysis=result;p.status=result.needsReview?'review':'done'});
     }
     break;
    }catch(e){
     if(control.abort.signal.aborted)throw e;
     if(e instanceof PanelResourceError){control.set('paused',e.message);await control.ready();continue}
     const message=e instanceof Error?e.message:'分析失败';
     library.update(id,c=>{const p=c.pages.find(x=>x.id===pageId)!;if(!p.override&&p.analysis?.panels.length){for(const later of c.pages)if(later.index>=p.index)delete later.content;if(c.story)c.storyStale=true}p.status='review';p.analysis={panels:[],needsReview:true,model:s.model,cacheKey:key,durationMs:0,error:message}});emit(id);
     if(e instanceof ApiError&&e.fatal){control.set('paused',message+'；修改设置后点击继续');await control.ready();continue}
     failed++;break;
    }
   }
   library.update(id,c=>{if(c.analysisTask)c.analysisTask.remainingPageIds=c.analysisTask.remainingPageIds.filter(pid=>pid!==pageId)});
   control.progress(++finished,selected.length);emit(id);
  }
 }
 void Promise.allSettled(engine==='local'?[work()]:[work(),work()]).then(results=>{if(control.abort.signal.aborted)return;const rejected=results.find(x=>x.status==='rejected');if(rejected?.status==='rejected')control.set('error',String(rejected.reason?.message||'任务异常'));else control.set('done',failed?`${failed} 页需复核，其余已完成`:'分析完成')}).finally(()=>{pending.delete(k);library.update(id,c=>{for(const p of c.pages)if(p.status==='analyzing')p.status='ready'});emit(id)});
}
function startStory(id:string,from:number,to:number,engine:'local'|'cloud'){
 const chapter=library.get(id);
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to>=chapter.pages.length||to-from>=20)throw Error('请选择连续 1～20 页');
 if(pending.has(id+':story')||pending.has(id+':analyze'))throw Error('请等待本章当前分析结束');
 if(engine==='cloud'&&!prefs.key())throw Error('请在设置中填写 API Key，或使用已安装的本地内容模型');
 if(engine==='local'&&[...jobs.values()].some(j=>j.job.kind==='story'&&pending.has(j.job.chapterId+':story')))throw Error('已有内容解析任务，请等待结束');
 if(engine==='local'&&!localRuntime.status().available)throw Error(localRuntime.status().message);
 const selected=chapter.pages.slice(from,to+1).map(p=>p.id),key=id+':story';
 library.update(id,c=>{c.storyTask={from,to,engine,state:'running',done:0,total:selected.length+1}});
 const control=new JobControl(id,'story',selected.length+1,j=>{library.update(id,c=>{if(c.storyTask){c.storyTask.state=j.state;c.storyTask.done=j.done;c.storyTask.message=j.message}});emit(id,j)});jobs.set(key,control);pending.add(key);
 void(async()=>{
  const config=engine==='local'?{...await localRuntime.start(control.abort.signal),maxImageSide:1400,wireApi:'chat-completions' as const}:{...prefs.public(),apiKey:prefs.key()};
  const contents:PageContent[]=[];
  for(const pageId of selected){
   await control.ready();const page=library.get(id).pages.find(p=>p.id===pageId)!;
   const context=contents.map(c=>c.summary).join('\n').slice(-7000);
   const fingerprint=sha(JSON.stringify([contentKey(page,config.model,engine==='local'?'local:':config.baseUrl,config.maxImageSide,config),context]));
   let content=page.content;
   if(!content||content.sourceKey!==fingerprint){
    const image=await analysisImage(readFileSync(library.pagePath(id,pageId)),config.maxImageSide);
    content=await requestPageContent({...config,page,image,mime:'image/jpeg',context,signal:control.abort.signal});
    content.sourceKey=fingerprint;control.abort.signal.throwIfAborted();
    const now=library.get(id).pages.find(p=>p.id===pageId)!;
    if(sha(JSON.stringify([contentKey(now,config.model,engine==='local'?'local:':config.baseUrl,config.maxImageSide,config),context]))!==fingerprint)throw Error('分镜发生变化，请重新生成内容');
    library.update(id,c=>{const p=c.pages.find(p=>p.id===pageId)!;if(c.story&&p.content?.sourceKey!==content!.sourceKey)c.storyStale=true;p.content=content});
   }
   contents.push(content);control.progress(contents.length,selected.length+1,`已理解 ${contents.length} / ${selected.length} 页`);
  }
  await control.ready();const fingerprint=storyKey(contents,config.model,engine==='local'?'local:':config.baseUrl,config);
  if(library.get(id).story?.sourceKey!==fingerprint||library.get(id).storyStale){
   library.update(id,c=>{if(c.story)c.storyStale=true});
   const draft=await requestStoryDraft({...config,contents,signal:control.abort.signal});control.abort.signal.throwIfAborted();
   const latest=library.get(id);
   if(contents.some(c=>latest.pages.find(p=>p.id===c.pageId)?.content?.sourceKey!==c.sourceKey))throw Error('分镜或事实已变化，请重新生成');
   draft.sourceKey=fingerprint;library.update(id,c=>{c.story=draft;c.storyStale=false});
  }
  control.progress(selected.length+1);control.set('done','剧情与解说草稿已保存；请查看待确认信息');
 })().catch(e=>{if(control.job.state!=='cancelled')control.set(e instanceof ApiError&&e.fatal?'paused':'error',e instanceof Error?e.message:'内容生成失败')}).finally(()=>{pending.delete(key);if(engine==='local')localRuntime.stop();emit(id)});
}
function registerIPC(){
 const methods:Record<string,(...args:any[])=>any>={
  saveReadingNote:(id:string,pageId:string,hash:string,version:number,text:string)=>{idSchema.parse(id);idSchema.parse(pageId);z.string().regex(/^[a-f0-9]{64}$/).parse(hash);z.string().max(12000).parse(text);const c=library.update(id,c=>{const p=c.pages.find(x=>x.id===pageId);if(!p)throw Error('页面不存在');p.readingNote=updateReadingNote(p,hash,version,text)});emit(id);return c},
  ocrStatus:()=>ocrRuntime.status(),
  panelModelStatus:()=>panelRuntime.status(),
  recognizeText:(id:string,from:number,to:number,force:boolean,mode:unknown='whole')=>ocrJobs.start(idSchema.parse(id),from,to,force===true,false,z.enum(['whole','refine']).parse(mode)),
  listChapters:()=>library.list(),
  getChapter:(id:string)=>library.get(idSchema.parse(id)),
  getOcrRefinement:(id:string,pageId:string)=>{const chapterId=idSchema.parse(id),pid=idSchema.parse(pageId);return refinementView(library.get(chapterId).pages.find(p=>p.id===pid))},
  importImages:async()=>{
   const result=await dialog.showOpenDialog(mainWindow,{title:'导入漫画图片',properties:['openFile','multiSelections'],filters:[{name:'漫画图片',extensions:['jpg','jpeg','png','webp']}]});
   if(result.canceled||!result.filePaths.length)return null;
   const paths=result.filePaths.sort((a,b)=>basename(a).localeCompare(basename(b),'zh-CN',{numeric:true}));
   const buffers=paths.map(p=>{if(statSync(p).size>30*1024*1024)throw Error('单张图片超过 30 MB');return readFileSync(p)});
   const id='local-'+sha(buffers.map(b=>sha(b)).join('|')).slice(0,32);
   const title=paths.length===1?basename(paths[0]):basename(dirname(paths[0]));
   const c=library.create('images',title,id);
   for(let i=0;i<buffers.length;i++){if(c.pages.some(p=>p.index===i))continue;const info=await imageInfo(buffers[i]);library.addPage(id,i,buffers[i],info.width,info.height)}
   const resultChapter=library.update(id,c=>{c.expectedPages=buffers.length;c.collectionStatus='complete'});emit(id);return resultChapter;
  },
  pickPdf:async()=>{
   const r=await dialog.showOpenDialog(mainWindow,{title:'导入漫画 PDF',properties:['openFile'],filters:[{name:'PDF',extensions:['pdf']}]});
   if(r.canceled||!r.filePaths.length)return null;const p=r.filePaths[0];if(statSync(p).size>300*1024*1024)throw Error('PDF 超过 300 MB，请拆分后导入');
   const bytes=readFileSync(p),name=basename(p);selectedPdf={name,hash:sha(bytes)};return {name,bytes:new Uint8Array(bytes)};
  },
  createPdf:(name:string)=>{if(!selectedPdf||name!==selectedPdf.name)throw Error('请先选择 PDF');return library.create('pdf',name,'pdf-'+selectedPdf.hash.slice(0,32))},
  addPdfPage:async(id:string,index:number,png:Uint8Array)=>{idSchema.parse(id);if(library.get(id).source!=='pdf')throw Error('章节类型错误');if(!(png instanceof Uint8Array)||png.byteLength>30*1024*1024)throw Error('PDF 页面数据无效');const size=await imageInfo(png);const c=library.addPage(id,index,png,size.width,size.height);emit(id);return c},
  finishPdf:(id:string,total:number)=>{idSchema.parse(id);if(!Number.isInteger(total)||total<1)throw Error('PDF 页数无效');const c=library.update(id,c=>{if(c.source!=='pdf')throw Error('章节类型错误');c.expectedPages=total;c.collectionStatus=c.pages.length===total&&c.pages.every((p,i)=>p.index===i)?'complete':'incomplete'});emit(id);return c},
  importUrl:(value:string)=>{const url=validateChapterUrl(value),id='copy-'+sha(new URL(url).pathname).slice(0,32);const c=library.create('copy','正在读取拷贝漫画章节',id,url);if(c.collectionStatus!=='complete')startCollection(id);return library.get(id)},
  continueCollection:(id:string)=>{idSchema.parse(id);const control=jobs.get(id+':collect');if(pending.has(id+':collect')&&control?.job.state==='paused'){control.set('running');library.update(id,c=>{c.collectionStatus='running'});emit(id);return}return startCollection(id)},
  analyzeLocal:(id:string,from:number,to:number)=>startAnalysis(idSchema.parse(id),from,to,false,false,'local'),
  generateStory:(id:string,from:number,to:number,engine:'local'|'cloud')=>startStory(idSchema.parse(id),from,to,z.enum(['local','cloud']).parse(engine)),
  localModelStatus:()=>localRuntime.status(),
  analyze:(id:string,from:number,to:number,force:boolean)=>startAnalysis(idSchema.parse(id),from,to,force===true),
  controlJob:(id:string,kind:Job['kind'],action:string)=>{
   idSchema.parse(id);z.enum(['collect','analyze','story','ocr']).parse(kind);z.enum(['pause','resume','cancel']).parse(action);
   if(kind==='ocr')return ocrJobs.control(id,action as 'pause'|'resume'|'cancel');
   const control=jobs.get(id+':'+kind);if(!control||!pending.has(id+':'+kind)){if(action==='resume'&&kind==='collect')return startCollection(id);const task=library.get(id).storyTask;if(kind==='story'&&task?.state==='paused'){if(action==='resume')return startStory(id,task.from,task.to,task.engine);if(action==='cancel'){library.update(id,c=>{c.storyTask!.state='cancelled'});emit(id,{chapterId:id,kind,state:'cancelled',done:task.done,total:task.total});return}}const saved=library.get(id).analysisTask;if(kind==='analyze'&&saved&&['paused','cancelled'].includes(saved.state)){if(action==='resume')return startAnalysis(id,saved.from,saved.to,saved.force,true,saved.engine||'cloud');if(action==='cancel'){library.update(id,c=>{c.analysisTask!.state='cancelled'});emit(id,{chapterId:id,kind,state:'cancelled',done:saved.done,total:saved.total});return}}throw Error('没有正在运行的任务')}
   if(control.job.state==='cancelled')throw Error('正在停止当前任务，请稍后点击继续');
   control.set(action==='pause'?'paused':action==='resume'?'running':'cancelled',action==='pause'?'已暂停；正在进行的请求完成后停下':undefined);
   if(kind==='collect')library.update(id,c=>{c.collectionStatus=action==='pause'?'paused':action==='resume'?'running':'cancelled'});emit(id);
  },
  showSource:(id:string)=>{idSchema.parse(id);const c=library.get(id);return source.show(id,validateChapterUrl(c.sourceUrl||''))},
  savePanels:(id:string,pageId:string,panels:unknown)=>{idSchema.parse(id);idSchema.parse(pageId);const validated=panels===null?null:validatePanels(panels);const c=library.update(id,c=>{const p=c.pages.find(x=>x.id===pageId);if(!p)throw Error('页面不存在');for(const later of c.pages)if(later.index>=p.index)delete later.content;if(c.story)c.storyStale=true;if(validated)p.override={panels:validated,version:(p.override?.version||0)+1,updatedAt:new Date().toISOString()};else delete p.override});emit(id);return c},
  saveProgress:(id:string,progress:ReadingProgress)=>{idSchema.parse(id);const p=progressSchema.parse(progress);library.update(id,c=>{if(c.pages.length)p.page=Math.min(p.page,c.pages.length-1);c.progress=p})},
  setDirection:(id:string,direction:ChapterManifest['direction'])=>{idSchema.parse(id);z.enum(['rtl','ltr']).parse(direction);if(pending.has(id+':analyze'))throw Error('请在分格任务结束或取消后切换阅读方向');return library.update(id,c=>{if(c.direction!==direction){for(const p of c.pages)delete p.content;if(c.story)c.storyStale=true}c.direction=direction})},
  getSettings:()=>prefs.public(),
  saveSettings:(value:unknown)=>prefs.save(z.object({baseUrl:z.string().max(1000),model:z.string(),apiKey:z.string().max(4096).optional(),maxImageSide:z.number(),provider:z.enum(['default','relay']).optional(),wireApi:z.enum(['chat-completions','responses']).optional(),reasoningEffort:z.enum(['low','medium','high']).optional()}).parse(value))
 };
 for(const [method,fn] of Object.entries(methods))ipcMain.handle('reader:'+method,async(event,...args)=>{
  if(event.sender!==mainWindow.webContents||event.senderFrame!==mainWindow.webContents.mainFrame)throw Error('请求来源无效');
  try{return await fn(...args)}catch(e){throw new Error(e instanceof z.ZodError?'输入参数无效':e instanceof Error?e.message:'操作失败')}
 });
}
app.whenReady().then(async()=>{
 const dataDir=!app.isPackaged&&process.env.READER_DATA_DIR?process.env.READER_DATA_DIR:join(app.getPath('userData'),'library');
 mkdirSync(dataDir,{recursive:true});library=new Library(dataDir);prefs=new Preferences(dataDir);
 ocrJobs=new OcrJobs(library,ocrRuntime,emit);ocrJobs.recover();
 // Interrupted jobs are resumable, never silently billed again on launch.
 for(const c of library.list())if(c.collectionStatus==='running'||c.pages.some(p=>p.status==='analyzing')||c.analysisTask?.state==='running')library.update(c.id,x=>{if(x.collectionStatus==='running')x.collectionStatus='incomplete';for(const p of x.pages)if(p.status==='analyzing')p.status='ready';if(x.analysisTask?.state==='running'){x.analysisTask.state='paused';x.analysisTask.message='上次分析中断，点击继续以恢复；尚未发送新请求'}});
 protocol.handle('manga',async request=>{try{const u=new URL(request.url);if(u.hostname!=='asset')return new Response('Not found',{status:404});const parts=u.pathname.split('/').filter(Boolean);if(parts.length!==2)return new Response('Not found',{status:404});const p=library.pagePath(decodeURIComponent(parts[0]),decodeURIComponent(parts[1]));const r=await net.fetch(pathToFileURL(p).href);const headers=new Headers(r.headers);headers.set('Access-Control-Allow-Origin','file://');return new Response(r.body,{status:r.status,headers})}catch{return new Response('Not found',{status:404})}});
 mainWindow=new BrowserWindow({width:1360,height:900,minWidth:980,minHeight:660,title:'逐格 · Manga Panel Reader',backgroundColor:'#11131a',webPreferences:{preload:join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 mainWindow.webContents.on('will-navigate',e=>e.preventDefault());
 for(const c of library.list())if(c.storyTask?.state==='running')library.update(c.id,x=>{x.storyTask!.state='paused';x.storyTask!.message='上次内容任务中断，点击继续'});
 registerIPC();
 await mainWindow.loadFile(join(__dirname,'renderer','index.html'));
 mainWindow.on('closed',()=>{for(const control of jobs.values())if(control.job.kind==='analyze'&&pending.has(control.job.chapterId+':analyze')&&control.job.state!=='cancelled'){control.set('paused','应用已关闭，点击继续处理剩余页');control.abort.abort()}source.closeAll();localRuntime.stop();ocrJobs.stop();panelRuntime.stop();app.quit()});
}).catch(e=>{dialog.showErrorBox('启动失败',e instanceof Error?e.message:'启动失败');app.quit()});
app.on('window-all-closed',()=>app.quit());


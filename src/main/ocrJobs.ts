import {readFileSync} from 'node:fs';
import {Library,sha} from './library';
import {JobControl} from './jobs';
import {analysisImage} from './images';
import {normalizeOcrOutput,ocrIsCached,OCR_PARAMETERS} from '../core/ocrTask';
import {planOcrCrops,refinementKey} from '../core/ocrRefinement';
import {sealRefinement,refinementIsCached} from '../core/ocrRefinementCache';
import {refineOcrPage} from './ocrRefinement';
import type {OcrMode} from '../shared/ocr';
import type {Job} from '../shared/types';
type Engine={status():{available:boolean;message:string};recognize(bytes:Uint8Array,signal:AbortSignal):Promise<any>;stop():void};
export class OcrJobs {
 private active?:{id:string;control:JobControl};
 constructor(private lib:Library,private engine:Engine,private notify:(id:string,job?:Job)=>void,private resize:(bytes:Uint8Array)=>Promise<Uint8Array>=bytes=>analysisImage(bytes,OCR_PARAMETERS.maxSide),private refine=refineOcrPage){}
 running(){return !!this.active}
 recover(){for(const c of this.lib.list())if(c.ocrTask?.state==='running')this.lib.update(c.id,x=>{x.ocrTask!.state='paused';x.ocrTask!.message='上次 OCR 中断；已保存结果保留，点击继续'})}
 start(id:string,from:number,to:number,force=false,resume=false,mode:OcrMode='whole'){
  if(this.active)throw Error('本地 OCR 正在处理，请暂停或取消现有任务');
  const c=this.lib.get(id);if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to>=c.pages.length)throw Error('OCR页码范围无效');
  const saved=resume?c.ocrTask:undefined,allowed=new Set(c.pages.slice(from,to+1).map(p=>p.id));
  if(saved&&(saved.from!==from||saved.to!==to||typeof saved.force!=='boolean'||!Number.isInteger(saved.total)||saved.total!==to-from+1||!Number.isInteger(saved.done)||saved.done<0||saved.done>saved.total||![saved.remainingPageIds,saved.failedPageIds].every(list=>Array.isArray(list)&&list.length<=saved.total&&new Set(list).size===list.length&&list.every(pid=>typeof pid==='string'&&allowed.has(pid)))))throw Error('OCR恢复记录无效或待处理页面已变化，请重新选择范围');
  const selected=saved?[...new Set([...saved.remainingPageIds,...saved.failedPageIds])]:c.pages.slice(from,to+1).map(p=>p.id);
  mode=saved?(saved.mode===undefined?'whole':saved.mode):mode;force=saved?.force??force;if(mode!=='whole'&&mode!=='refine')throw Error('OCR模式无效');
  // Old builds saved remaining and done separately. Requeue any implicit
  // "finished" page without valid results; cache evidence, not counters, wins.
  if(saved)for(const page of c.pages.slice(from,to+1))if(!selected.includes(page.id)&&!(mode==='whole'?ocrIsCached(page):refinementIsCached(page)))selected.push(page.id);
  const needsModel=(page:typeof c.pages[number])=>mode==='whole'?force||!ocrIsCached(page):!ocrIsCached(page)||(force||!refinementIsCached(page))&&planOcrCrops(page).crops.length>0;
  const status=this.engine.status();if(selected.some(pid=>needsModel(c.pages.find(p=>p.id===pid)!))&&!status.available)throw Error(status.message);
  const total=saved?.total??selected.length,base=total-selected.length;
  this.lib.update(id,x=>{x.ocrTask={from,to,force,mode,remainingPageIds:selected,failedPageIds:[],state:'running',done:base,total}});
  const control=new JobControl(id,'ocr',total,j=>{this.lib.update(id,x=>{if(x.ocrTask){x.ocrTask.state=j.state;x.ocrTask.done=j.done+base;x.ocrTask.message=j.message}});this.notify(id,{...j,done:j.done+base})});this.active={id,control};
  void this.work(id,selected,force,mode,control).catch(e=>{if(!control.abort.signal.aborted)control.set('error',e instanceof Error?e.message:'OCR任务异常')}).finally(()=>{this.engine.stop();this.active=undefined;this.notify(id)});
 }
 private async work(id:string,selected:string[],force:boolean,mode:OcrMode,control:JobControl){
  let finished=0;
  for(const pid of selected){
   await control.ready();let page=this.lib.get(id).pages.find(p=>p.id===pid);if(!page)throw Error('OCR页面已变化');
   try{
    const needWhole=!ocrIsCached(page)||(mode==='whole'&&force),needRefine=mode==='refine'&&(force||!refinementIsCached(page)),originalPlan=mode==='refine'?JSON.stringify(planOcrCrops(page)):undefined;
    if(needWhole||needRefine){
     control.progress(finished,control.job.total,`正在识别第 ${page.index+1} 页 · 首次加载可能较慢`);
     const bytes=readFileSync(this.lib.pagePath(id,pid));if(sha(bytes)!==page.hash)throw Error('OCR原图内容哈希不匹配');
     if(needWhole){
      const start=Date.now(),input=await this.resize(bytes);control.abort.signal.throwIfAborted();const raw=await this.engine.recognize(input,control.abort.signal);control.abort.signal.throwIfAborted();
      const doc=normalizeOcrOutput(page,raw,Date.now()-start),source=page;
      this.lib.update(id,x=>{const latest=x.pages.find(p=>p.id===pid);if(!latest||latest.hash!==source.hash||latest.width!==source.width||latest.height!==source.height||sha(readFileSync(this.lib.pagePath(id,pid)))!==latest.hash)throw Error('OCR来源已变化，结果未覆盖');latest.ocr=doc;delete latest.ocrError});
      page=this.lib.get(id).pages.find(p=>p.id===pid)!;
     }
     if(mode==='refine'&&(force||!refinementIsCached(page))){
      if(JSON.stringify(planOcrCrops(page))!==originalPlan)throw Error('OCR增强画格已变化，未开始裁图；整页原文独立保留');
      control.progress(finished,control.job.total,`正在增强第 ${page.index+1} 页 · 整页原文独立保留，裁图候选待复核`);
      const result=await this.refine(page,bytes,page.ocr!,this.engine,control.abort.signal);control.abort.signal.throwIfAborted();
      const source=page;
      this.lib.update(id,x=>{
       const latest=x.pages.find(p=>p.id===pid);if(!latest||latest.hash!==source.hash||latest.width!==source.width||latest.height!==source.height||!ocrIsCached(latest)||refinementKey(latest,latest.ocr!,planOcrCrops(latest))!==result.recipeKey||sha(readFileSync(this.lib.pagePath(id,pid)))!==latest.hash)throw Error('OCR增强来源或画格已变化，结果未覆盖');
       const sealed=sealRefinement(result);
       if(result.complete){if(!refinementIsCached({...latest,ocrRefinement:sealed}))throw Error('OCR增强结果结构无效');latest.ocrRefinement=sealed;delete latest.ocrRefinementDraft;delete latest.ocrRefinementError}
       else {latest.ocrRefinementDraft=sealed;latest.ocrRefinementError='部分裁图失败；上次完整候选与整页原文保留'}
      });
      if(!result.complete)throw Error('部分裁图失败；点击继续重试本页增强，整页原文保留');
     }
    }
   }catch(e){
    if(control.abort.signal.aborted)throw e;
    this.lib.update(id,x=>{x.ocrTask!.failedPageIds.push(pid);const p=x.pages.find(p=>p.id===pid);if(p){const message=e instanceof Error?e.message:'OCR识别失败';if(mode==='refine')p.ocrRefinementError=message;else p.ocrError=message}});
   }
   finished++;this.lib.update(id,x=>{x.ocrTask!.remainingPageIds=x.ocrTask!.remainingPageIds.filter(p=>p!==pid);x.ocrTask!.done=x.ocrTask!.total-selected.length+finished});control.progress(finished);
  }
  const failed=this.lib.get(id).ocrTask!.failedPageIds.length;control.set(failed?'error':'done',failed?`${failed} 页失败；已保存的原文保留，点击继续仅重试失败页`:mode==='refine'?'局部候选已保存；整页原文保留，无可用画格的页面不额外裁图':'OCR原文已保存；阅读和翻页使用本地缓存');
 }
 control(id:string,action:'pause'|'resume'|'cancel'){
  if(this.active?.id===id){if(this.active.control.job.state==='cancelled')throw Error('OCR取消后仍在清理，请稍后点击继续');this.active.control.set(action==='pause'?'paused':action==='resume'?'running':'cancelled',action==='pause'?'当前页完成后暂停':undefined);return}
  const task=this.lib.get(id).ocrTask;
  if(action==='resume'&&task&&['paused','cancelled','error'].includes(task.state))return this.start(id,task.from,task.to,task.force,true,task.mode??'whole');
  if(action==='cancel'&&task&&task.state==='paused'){this.lib.update(id,x=>{x.ocrTask!.state='cancelled'});this.notify(id);return}
  throw Error('没有可控制的 OCR 任务');
 }
 stop(){this.active?.control.set('cancelled');this.engine.stop()}
}

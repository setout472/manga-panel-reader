import {RTDETR_ADAPTER_VERSION} from '../core/rtdetrPanels';
import {utilityProcess} from 'electron';import {join} from 'node:path';import sharp from 'sharp';import {PanelProcess} from './panelProcess';import {verifyPanelAssets,panelAssetsPresent,PANEL_MODEL} from './panelAssets';import {validatePanels} from '../core/panels';import type {Analysis} from '../shared/types';
export class PanelResourceError extends Error{}
export class PanelRuntime {
 private process:PanelProcess;
 constructor(private root:string,workerFile=join(__dirname,'panel-worker.cjs')){
  this.process=new PanelProcess(()=>{
   try{verifyPanelAssets(this.root)}catch{throw new PanelResourceError('专用分格资源校验失败；已保留原结果，请恢复完整资源后继续')}
   const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH'].filter(k=>process.env[k]).map(k=>[k,process.env[k]!]));
   return utilityProcess.fork(workerFile,[root],{serviceName:'Manga local panels',stdio:'ignore',env});
  });
 }
 status(){return panelAssetsPresent(this.root)?{available:true,message:'本地专用分格 · 免 Key；复杂跨格与顺序建议复核'}:{available:false,message:'专用分格资源缺失；使用轻量几何分格，或恢复完整软件目录'}}
 stop(){this.process.stop()}
 async detect(bytes:Uint8Array,direction:'rtl'|'ltr',signal:AbortSignal):Promise<Omit<Analysis,'cacheKey'>>{
  signal.throwIfAborted();const meta=await sharp(bytes,{limitInputPixels:60_000_000}).metadata();if(!meta.width||!meta.height)throw Error('图片尺寸无效');const swap=!!meta.orientation&&meta.orientation>=5,width=swap?meta.height:meta.width,height=swap?meta.width:meta.height;
  const rgba=await sharp(bytes,{limitInputPixels:60_000_000}).rotate().flatten({background:'#fff'}).toColourspace('srgb').resize(1280,1280,{fit:'fill',kernel:'linear'}).ensureAlpha().raw().toBuffer();signal.throwIfAborted();
  const r=await this.process.run({rgba:new Uint8Array(rgba),width,height,direction},signal);signal.throwIfAborted();
  const panels=validatePanels(r.readingPanels.length?r.readingPanels:[{id:'whole-page',order:1,x:0,y:0,width:1,height:1}]);
  return {panels,needsReview:true,model:PANEL_MODEL,durationMs:r.durationMs,layout:{framePanels:r.panels,textRegions:r.textRegions,bodyRegions:r.bodyRegions,unassignedTextRegions:r.unassignedTextRegions,orderUncertain:r.orderUncertain,version:RTDETR_ADAPTER_VERSION}};
 }
}

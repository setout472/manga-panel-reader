import {randomUUID} from 'node:crypto';
export type PanelInput={rgba:Uint8Array;width:number;height:number;direction:'rtl'|'ltr'};
export interface PanelWorker {postMessage(data:unknown):void;kill():boolean;on(event:string,listener:(...args:any[])=>void):this;removeListener(event:string,listener:(...args:any[])=>void):this}
/** Native inference lives in a killable process, never the main/UI event loop. */
export class PanelProcess {
 private child?:PanelWorker;private busy=false;private cancel?:()=>void;private idle?:ReturnType<typeof setTimeout>;
 constructor(private create:()=>PanelWorker,private timeoutMs=90000){}
 stop(){if(this.idle)clearTimeout(this.idle);this.idle=undefined;if(this.cancel){this.cancel();return}const child=this.child;this.child=undefined;child?.kill()}
 async run(input:PanelInput,signal:AbortSignal):Promise<any>{
  signal.throwIfAborted();if(this.busy)throw Error('本地专用分格正在运行，请等待当前任务');this.busy=true;if(this.idle)clearTimeout(this.idle);
  try{return await new Promise((resolve,reject)=>{
   let child:PanelWorker;try{if(!this.child){child=this.create();this.child=child;const forget=()=>{if(this.child===child)this.child=undefined};child.on('exit',forget);child.on('error',forget)}else child=this.child}catch(e){reject(e);return}
   const id=randomUUID();let done=false;let timer:ReturnType<typeof setTimeout>;
   const finish=(error?:Error,result?:unknown)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);child.removeListener('message',message);child.removeListener('exit',exit);child.removeListener('error',failed);this.cancel=undefined;
    if(error){if(this.child===child)this.child=undefined;child.kill();reject(error)}else{this.idle=setTimeout(()=>this.stop(),30000);this.idle.unref();resolve(result)}
   };
   const abort=()=>finish(new Error('本地分格已取消')),exit=()=>finish(new Error('本地分格进程退出，请重试')),failed=()=>finish(new Error('本地分格进程启动失败'));
   const message=(data:any)=>{if(data?.id!==id)return;if(data.error)finish(new Error(String(data.error).slice(0,300)));else finish(undefined,data.result)};
   this.cancel=abort;child.on('message',message);child.on('exit',exit);child.on('error',failed);signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(new Error('本地分格超时，请缩小处理范围')),this.timeoutMs);
   if(signal.aborted){abort();return}try{child.postMessage({id,...input})}catch{failed()}
  })}finally{this.busy=false}
 }
}

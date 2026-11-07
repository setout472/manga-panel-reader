import {spawn,type ChildProcess} from 'node:child_process';
import {existsSync,openSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
export type LocalOptions={model?:string;label?:string;contextSize?:number;gpuLayers?:number};
export function localLaunchArgs(root:string,port:number,apiKey:string,options:LocalOptions={}){
 const {model='local-qwen3vl-2b',contextSize=8192,gpuLayers=99}=options;
 if(!Number.isInteger(contextSize)||contextSize<1024||contextSize>32768||!Number.isInteger(gpuLayers)||gpuLayers<0||gpuLayers>99)throw Error('本地模型资源参数无效');
 return ['-m',join(root,'model.gguf'),'--mmproj',join(root,'mmproj.gguf'),'--host','127.0.0.1','--port',String(port),'--api-key',apiKey,'--alias',model,'-c',String(contextSize),'-ngl',String(gpuLayers),'--parallel','1'];
}
export class LocalRuntime{
 private child?:ChildProcess;private starting?:Promise<{baseUrl:string;model:string;apiKey:string}>;private endpoint?:{baseUrl:string;model:string;apiKey:string};
 constructor(private root:string,private options:LocalOptions={}){}
 status(){const available=['bin/llama-server.exe','model.gguf','mmproj.gguf'].every(p=>existsSync(join(this.root,p)));return {available,message:available?`本地 ${this.options.label||'Qwen3-VL 2B'} 已就绪；首次启动需要加载模型`:'本地内容模型尚未安装；本地几何分格仍可直接使用'}}
 async start(signal?:AbortSignal){signal?.throwIfAborted();if(this.endpoint)return this.endpoint;if(this.starting)return this.starting;this.starting=this.launch(signal);try{return await this.starting}catch(e){this.stop();throw e}finally{this.starting=undefined}}
 private async launch(signal?:AbortSignal){
  if(!this.status().available)throw Error(this.status().message);
  const port=await new Promise<number>((resolve,reject)=>{const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=(s.address() as {port:number}).port;s.close(()=>resolve(p))})});
  const apiKey=randomUUID(),baseUrl=`http://127.0.0.1:${port}/v1`;
  const log=openSync(join(this.root,'runtime.log'),'w');
  const child=spawn(join(this.root,'bin/llama-server.exe'),localLaunchArgs(this.root,port,apiKey,this.options),{windowsHide:true,stdio:['ignore',log,log]});closeSync(log);this.child=child;
  let failed=false;child.once('error',()=>{failed=true});child.once('exit',()=>{failed=true;this.endpoint=undefined;if(this.child===child)this.child=undefined});
  for(let i=0;i<180;i++){signal?.throwIfAborted();if(failed)throw Error('本地模型启动失败，请检查引擎文件与显存');try{const r=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(1000)});if(r.ok){this.endpoint={baseUrl,apiKey,model:this.options.model||'local-qwen3vl-2b'};return this.endpoint}}catch{}await new Promise(r=>setTimeout(r,500))}
  this.stop();throw Error('本地模型加载超时');
 }
 stop(){this.child?.kill();this.child=undefined;this.endpoint=undefined}
}


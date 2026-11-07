import {BrowserWindow,session} from 'electron';
import {createServer,type Server} from 'node:http';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {verifyOcrAssets} from './ocrAssets';
export class OcrRuntime {
 private window?:BrowserWindow;private server?:Server;private busy=false;
 constructor(private root:string){}
 status(){try{verifyOcrAssets(this.root);return {available:true,message:'本地 OCR 资源已校验；免 Key，图片不上传'}}catch{return {available:false,message:'本地 OCR 资源缺失或校验失败，已缓存的原文仍可阅读'}}}
 stop(){const w=this.window;this.window=undefined;if(w&&!w.isDestroyed())w.destroy();this.server?.close();this.server=undefined;}
 private async start(signal:AbortSignal){
  if(this.window&&!this.window.isDestroyed())return;
  const files=verifyOcrAssets(this.root);
  const server=createServer((req,res)=>{
   const key=req.url==='/'?'index.html':req.url?.slice(1),asset=files.get(key||'');
   if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${(server.address() as any)?.port}`||!asset){res.writeHead(404);res.end();return}
   res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:; style-src 'none'; base-uri 'none'; object-src 'none'");
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',key!.endsWith('.wasm')?'application/wasm':key!.endsWith('.html')?'text/html':'text/javascript');
   res.end(readFileSync(asset.path));
  });this.server=server;
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});signal.throwIfAborted();
  const origin=`http://127.0.0.1:${(server.address() as any).port}`,ses=session.fromPartition('ocr-'+randomUUID());
  ses.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith(origin+'/')&&!d.url.startsWith('blob:'+origin+'/')}));ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,session:ses}});this.window=win;
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  await win.loadURL(origin+'/');signal.throwIfAborted();
  if(!await win.webContents.executeJavaScript('window.ocrReady===true'))throw Error('OCR引擎初始化失败');
 }
 async recognize(image:Uint8Array,signal:AbortSignal):Promise<any>{
  if(this.busy)throw Error('本地 OCR 正在处理另一个任务');this.busy=true;
  const abort=()=>this.stop();signal.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(()=>this.stop(),180_000);
  try{signal.throwIfAborted();if(image.length>20_000_000)throw Error('OCR分析图片过大');await this.start(signal);signal.throwIfAborted();
   const result=await this.window!.webContents.executeJavaScript(`window.recognizeOcr(${JSON.stringify(Buffer.from(image).toString('base64'))})`);signal.throwIfAborted();return result;
  }catch(e){this.stop();signal.throwIfAborted();throw e}finally{clearTimeout(timeout);signal.removeEventListener('abort',abort);this.busy=false}
 }
}

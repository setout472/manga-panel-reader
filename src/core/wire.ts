export type WireOptions={wireApi?:'chat-completions'|'responses';reasoningEffort?:'low'|'medium'|'high'};
export async function boundedWireJson(response:Response,signal:AbortSignal):Promise<Record<string,unknown>>{
 if(!response.body)throw Error('响应为空');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 const abort=()=>{void reader.cancel().catch(()=>{})};signal.addEventListener('abort',abort,{once:true});
 try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();signal.throwIfAborted();if(done)break;size+=value.length;if(size>300_000){await reader.cancel();throw Error('响应超限')}chunks.push(value)}const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!result||typeof result!=='object'||Array.isArray(result))throw Error('响应格式无效');return result}finally{signal.removeEventListener('abort',abort);reader.releaseLock()}
}
export function transportIdentity(baseUrl:string,options:WireOptions={}):string {
 const base=baseUrl.replace(/\/$/,'');return options.wireApi==='responses'?base+'#responses-v1:'+ (options.reasoningEffort??'high'):base;
}
export function wireRequest(baseUrl:string,options:WireOptions,chatBody:Record<string,unknown>){
 const url=new URL(baseUrl);
 if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw Error('模型服务须使用 HTTPS 或明确的本机 HTTP 地址');
 const base=url.href.replace(/\/$/,'');
 if(options.wireApi&& !['chat-completions','responses'].includes(options.wireApi))throw Error('接口协议无效');
 if(options.wireApi!=='responses')return {url:base+'/chat/completions',body:JSON.stringify(chatBody)};
 const effort=options.reasoningEffort??'high';if(!['low','medium','high'].includes(effort))throw Error('推理强度无效');
 const messages=chatBody.messages as {role:string;content:string|{type:string;text?:string;image_url?:{url:string;detail?:string}}[]}[];
 const input=messages.map(m=>({role:m.role,content:typeof m.content==='string'?[{type:'input_text',text:m.content}]:m.content.map(c=>{
  if(c.type==='text')return {type:'input_text',text:c.text};
  if(c.type==='image_url'&&c.image_url)return {type:'input_image',image_url:c.image_url.url,detail:c.image_url.detail??'high'};
  throw Error('Responses输入类型无效');
 })}));
 return {url:base+'/responses',body:JSON.stringify({model:chatBody.model,input,reasoning:{effort},store:false,stream:false,max_output_tokens:chatBody.max_tokens??8192,text:{format:{type:'json_object'}}})};
}
export function normalizeWireResponse(value:Record<string,unknown>,options:WireOptions):Record<string,unknown>{
 if(options.wireApi!=='responses')return value;
 if(value.status!=='completed'||value.error||value.incomplete_details||!Array.isArray(value.output))throw Error('Responses未完成');
 const messages=value.output.filter(x=>x&&x.type==='message'&&x.role==='assistant');
 if(messages.length!==1||messages[0].status!=='completed'||!Array.isArray(messages[0].content))throw Error('Responses正文格式无效');
 const chunks=messages[0].content;
 if(!chunks.length||chunks.some((c:unknown)=>!c||typeof c!=='object'||(c as {type?:string}).type!=='output_text'||typeof (c as {text?:string}).text!=='string'))throw Error('Responses正文为空或包含拒答');
 const usage=value.usage&&typeof value.usage==='object'?value.usage as Record<string,unknown>:{};
 return {choices:[{finish_reason:'stop',message:{content:chunks.map((c:{text:string})=>c.text).join('')}}],usage:{prompt_tokens:usage.input_tokens,completion_tokens:usage.output_tokens,total_tokens:usage.total_tokens}};
}

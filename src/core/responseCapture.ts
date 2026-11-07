/** Diagnostic clone is bounded independently; malformed envelopes remain core format errors, not fetch errors. */
export async function captureResponse(response:Response,signal?:AbortSignal):Promise<Record<string,unknown>>{
 const clone=response.clone();if(!clone.body)return {captureError:'empty-body'};
 const reader=clone.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 const abort=()=>{void reader.cancel().catch(()=>{})};signal?.addEventListener('abort',abort,{once:true});
 try{
  while(true){if(signal?.aborted){abort();return {captureError:'aborted'}}const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>300_000){abort();return {captureError:'over-limit'}}chunks.push(value)}
  let data:any;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return {captureError:'invalid-json'}}
  if(!data||typeof data!=='object'||Array.isArray(data))return {captureError:'invalid-json'};
  const usage:Record<string,number>={};for(const k of ['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens'])if(Number.isSafeInteger(data.usage?.[k])&&data.usage[k]>=0)usage[k]=data.usage[k];
  return {model:typeof data.model==='string'?data.model.slice(0,200):undefined,content:typeof data.choices?.[0]?.message?.content==='string'?data.choices[0].message.content:undefined,finish_reason:data.choices?.[0]?.finish_reason,usage};
 }catch{return {captureError:'capture-failed'}}finally{signal?.removeEventListener('abort',abort);reader.releaseLock()}
}

export type RequestIdentity={stage:string;inputHash:string;lineage:string};
export type RecoveredMetric={id:number;stage:string;status:number;usage:Record<string,number>;durationMs:number|null;recovered:true};
export function restoreRequestMetric(requests:{id:number}[],id:number,value:any,source:RequestIdentity):void{
 if(!Number.isSafeInteger(id)||id<1||requests.some(m=>m.id===id)||!checkpointResponse(value,source))return;
 const usage:Record<string,number>={};for(const key of ['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens'])if(value.usage?.[key]!==undefined)usage[key]=value.usage[key];
 const metric:RecoveredMetric={id,stage:source.stage,status:200,usage,durationMs:Number.isFinite(value.durationMs)&&value.durationMs>=0?value.durationMs:null,recovered:true};requests.push(metric);
}
/** Only complete, source-bound diagnostic captures may replace a paid request. Core still validates content. */
export function checkpointResponse(value:any,source:RequestIdentity):Response|undefined{
 if(!value||value.stage!==source.stage||value.inputHash!==source.inputHash||value.lineage!==source.lineage||!source.stage||! /^[a-f0-9]{64}$/.test(source.inputHash)||! /^[a-f0-9]{64}$/.test(source.lineage))return;
 if(value.status!==200||value.captureError||value.finish_reason!=='stop'||typeof value.content!=='string'||!value.content||value.content.length>300_000)return;
 const usage:Record<string,number>={};
 for(const key of ['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens']){
  const n=value.usage?.[key];if(n===undefined)continue;if(!Number.isSafeInteger(n)||n<0)return;usage[key]=n;
 }
 return new Response(JSON.stringify({model:typeof value.model==='string'?value.model.slice(0,200):undefined,choices:[{message:{content:value.content},finish_reason:'stop'}],usage}),{status:200,headers:{'Content-Type':'application/json'}});
}

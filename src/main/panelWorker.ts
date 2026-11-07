import {join} from 'node:path';import {createRequire} from 'node:module';import {rtdetrImageInput,rtdetrTargetSize} from '../core/rtdetrInput';import {decodeRtdetrDetections} from '../core/rtdetrPanels';
// Internal utility process only. Renderer has no access to this port or root path.
const port=process.parentPort!,root=process.argv[2],ort=createRequire(__filename)(join(root,'node_modules/onnxruntime-node/dist/index.js'));let model:any;
port.on('message',async({data}:any)=>{
 const id=data?.id;try{
  const start=performance.now();const pixels=rtdetrImageInput(data.rgba),size=rtdetrTargetSize(data.width,data.height);
  if(!['rtl','ltr'].includes(data.direction))throw Error('阅读方向无效');
  model??=await ort.InferenceSession.create(join(root,'model.onnx'),{executionProviders:['cpu'],intraOpNumThreads:4,interOpNumThreads:1,graphOptimizationLevel:'all'});
  const began=performance.now(),output=await model.run({images:new ort.Tensor('float32',pixels,[1,3,1280,1280]),orig_target_sizes:new ort.Tensor('int64',size,[1,2])});
  const decoded=decodeRtdetrDetections(Array.from(output.labels.data,Number),Array.from(output.boxes.data,Number),Array.from(output.scores.data,Number),data.width,data.height,data.direction);
  port.postMessage({id,result:{...decoded,durationMs:Math.round(performance.now()-start),inferenceMs:Math.round(performance.now()-began)}});
 }catch(e){port.postMessage({id,error:e instanceof Error?e.message:'专用分格失败'})}
});

import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const pinnedModels:Record<string,string>={'models/det.tar':'d218f6fbf0f1c23d2161bd6ac7f5eaa6104fa89955c09290497e31008e2618e4','models/rec.tar':'d267ab077a44a0eedb1ea8f8c542d263f211de8e9d7a029bf9fcfff7e5a88fb1'};
export function verifyOcrAssets(root:string):Map<string,{path:string;size:number}>{
 const doc=JSON.parse(readFileSync(join(root,'assets.json'),'utf8'));
 if(doc.version!==1||doc.sdk!=='0.4.2'||doc.model!=='PP-OCRv6_small'||!Array.isArray(doc.assets)||doc.assets.length>40)throw Error('OCR资源清单无效');
 const files=new Map<string,{path:string;size:number}>();
 for(const a of doc.assets){
  if(!a||typeof a.file!=='string'||! /^(index\.html|engine\.js|models\/(det|rec)\.tar|ort\/ort-wasm-simd-threaded(?:\.(?:asyncify|jsep|jspi))?\.(mjs|wasm))$/.test(a.file)||files.has(a.file)||!Number.isSafeInteger(a.size)||a.size<=0||a.size>60_000_000||! /^[a-f0-9]{64}$/.test(a.sha256))throw Error('OCR资源路径或校验字段无效');
  if(pinnedModels[a.file]&&pinnedModels[a.file]!==a.sha256)throw Error('OCR模型哈希不匹配');
  const path=join(root,a.file);if(statSync(path).size!==a.size||createHash('sha256').update(readFileSync(path)).digest('hex')!==a.sha256)throw Error('OCR资源损坏');files.set(a.file,{path,size:a.size});
 }
 for(const required of ['index.html','engine.js','models/det.tar','models/rec.tar','ort/ort-wasm-simd-threaded.mjs','ort/ort-wasm-simd-threaded.wasm'])if(!files.has(required))throw Error('OCR资源不完整');return files;
}

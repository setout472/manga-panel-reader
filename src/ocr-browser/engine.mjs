import {PaddleOCR} from '@paddleocr/paddleocr-js';
let engine;
window.ocrReady=true;
window.recognizeOcr=async(base64)=>{
 engine??=await PaddleOCR.create({textDetectionModelName:'PP-OCRv6_small_det',textDetectionModelAsset:{url:'/models/det.tar'},textRecognitionModelName:'PP-OCRv6_small_rec',textRecognitionModelAsset:{url:'/models/rec.tar'},ortOptions:{backend:'wasm',wasmPaths:'/ort/',numThreads:1},worker:false});
 const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 const [result]=await engine.predict(new Blob([bytes],{type:'image/jpeg'}),{textDetLimitSideLen:2048,textDetLimitType:'max',textRecScoreThresh:0});
 return {image:result.image,items:result.items.map(l=>({text:l.text,score:l.score,poly:l.poly}))};
};

/** Experimental RT-DETR author contract: RGB stretch, NCHW /255, original [w,h]. */
export const RTDETR_INPUT_SIZE=1280;
export function rtdetrImageInput(rgba:Uint8Array|Uint8ClampedArray):Float32Array{
 const plane=RTDETR_INPUT_SIZE*RTDETR_INPUT_SIZE;
 if(rgba.length!==plane*4)throw Error('RT-DETR requires a stretched 1280×1280 RGBA image');
 const data=new Float32Array(plane*3);
 for(let i=0;i<plane;i++){data[i]=rgba[i*4]/255;data[i+plane]=rgba[i*4+1]/255;data[i+2*plane]=rgba[i*4+2]/255}
 return data;
}
export function rtdetrTargetSize(width:number,height:number):BigInt64Array{
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||width*height>80_000_000)throw Error('RT-DETR original dimensions are invalid');
 return new BigInt64Array([BigInt(width),BigInt(height)]);
}

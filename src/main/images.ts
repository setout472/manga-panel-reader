import sharp from 'sharp';
export async function imageInfo(data:Uint8Array){
 if(data.byteLength>30*1024*1024)throw Error('单张图片超过 30 MB');
 const meta=await sharp(data,{limitInputPixels:60_000_000}).metadata();
 if(!['jpeg','png','webp'].includes(meta.format||''))throw Error('仅支持 JPG、PNG 和 WebP');
 if(!meta.width||!meta.height)throw Error('图片尺寸无效');
 // Force pixel decoding so corrupt/truncated files do not enter the library.
 await sharp(data,{limitInputPixels:60_000_000}).resize({width:1,height:1}).raw().toBuffer();
 const rotate=meta.orientation&&meta.orientation>=5;
 return {width:rotate?meta.height:meta.width,height:rotate?meta.width:meta.height};
}
export async function analysisImage(data:Uint8Array,side:number){return sharp(data,{limitInputPixels:60_000_000}).rotate().resize({width:side,height:side,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:90}).toBuffer()}

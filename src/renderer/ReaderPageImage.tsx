import {useEffect,useState} from 'react';import type {Rect} from '../shared/types';import {Icon} from './Icons';import {readerImageTransition,type ReaderImageStatus} from './readerImageState';
type Props={src:string;hash:string;width:number;height:number;crop:Rect;displayWidth:number;displayHeight:number;label:string;onRetryFocus:()=>void};
// Reader keys this component by source, not by crop or zoom. Each retry has its
// own lifetime so old events cannot complete a newer page/attempt.
export function ReaderPageImage(props:Props){
 const [attempt,setAttempt]=useState(0),url=new URL(props.src);url.searchParams.set('reader-image',props.hash);if(attempt)url.searchParams.set('reader-retry',String(attempt));
 return <ImageAttempt key={attempt} {...props} src={url.href} onRetry={()=>{props.onRetryFocus();setAttempt(n=>n+1)}}/>;
}
function ImageAttempt({src,width,height,crop,displayWidth,displayHeight,label,onRetry}:Omit<Props,'hash'|'onRetryFocus'>&{onRetry:()=>void}){
 const [status,setStatus]=useState<ReaderImageStatus>('loading');
 useEffect(()=>{if(status!=='loading')return;const timer=setTimeout(()=>setStatus(s=>readerImageTransition(s,'timeout')),20000);return()=>clearTimeout(timer)},[status]);
 const ready=status==='ready';
 return <>
 {status==='loading'&&<div className="reader-placeholder" role="status"><Icon name="image"/><p>正在加载页面…</p></div>}
 {status==='error'&&<div className="reader-placeholder" role="alert"><Icon name="image"/><h3>页面图片加载失败</h3><p>文件可能缺失、损坏或读取超时。恢复本地原图后重试，原文与阅读进度仍保留。</p><button onClick={onRetry}>重新加载页面</button><p>只重新读取原图，不重新识别或调用 AI。</p></div>}
 <div className="reader-canvas-center" hidden={!ready} style={!ready?{position:'absolute',visibility:'hidden',pointerEvents:'none'}:undefined}>
 <svg className="manga-canvas" viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`} style={{width:displayWidth,height:displayHeight}} aria-label={label} aria-hidden={!ready} role="img">
 <image href={src} width={width} height={height} x="0" y="0" preserveAspectRatio="none" onLoad={()=>setStatus(s=>readerImageTransition(s,'load'))} onError={()=>setStatus(s=>readerImageTransition(s,'error'))}/>
 </svg></div>
 </>;
}

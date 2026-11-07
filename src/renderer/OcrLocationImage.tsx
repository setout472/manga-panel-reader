import {useEffect,useState} from 'react';
import type {ocrLocation} from './ocrLocationModel';
type Location=NonNullable<ReturnType<typeof ocrLocation>>;
type Props={src:string;loc:Location;onRetryFocus:()=>void};

// Each source and retry gets a separate state lifetime. Old image events never
// make a newer attempt ready; a timed-out attempt remains failed until retry.
export function OcrLocationImage(props:Props){
 const [attempt,setAttempt]=useState(0);
 return <ImageAttempt key={attempt} {...props} src={props.src+(attempt?`&ocr-location-retry=${attempt}`:'')} onRetry={()=>{props.onRetryFocus();setAttempt(n=>n+1)}}/>;
}
function ImageAttempt({src,loc,onRetry}:{src:string;loc:Location;onRetry:()=>void}){
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[detail,setDetail]=useState(false);
 useEffect(()=>{if(status!=='loading')return;const timer=setTimeout(()=>setStatus(s=>s==='loading'?'error':s),20000);return()=>clearTimeout(timer)},[status]);
 const ready=status==='ready',box=detail?loc.detail:loc.full;
 return <>
 <div className="range-presets"><button disabled={!ready} aria-pressed={!detail} onClick={()=>setDetail(false)}>整页位置</button><button disabled={!ready} aria-pressed={detail} onClick={()=>setDetail(true)}>局部放大</button></div>
 {status==='loading'&&<p role="status" className="assist-note">正在加载原图，位置框将在图片读取成功后显示。</p>}
 {status==='error'&&<div role="alert" className="assist-warning"><p>原图加载失败：文件可能缺失、损坏或读取超时。原文仍可查看，位置框已隐藏。</p><p>恢复资料库中的原图后重试；不会重新识别或调用 AI。</p><button onClick={onRetry}>重新加载原图</button></div>}
 <div className="ocr-location-picture" hidden={status==='error'}>
 <svg role="img" aria-label="漫画原图与OCR位置" aria-hidden={!ready} style={{visibility:ready?'visible':'hidden'}} viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`} preserveAspectRatio="xMidYMid meet">
 <image href={src} width={loc.full.width} height={loc.full.height} onLoad={()=>setStatus(s=>s==='loading'?'ready':s)} onError={()=>setStatus('error')}/>
 {ready&&<polygon data-testid="ocr-location-polygon" points={loc.points} fill="#fbad7230" stroke="#ff9b60" strokeWidth={Math.max(1,box.width/400)}/>}
 </svg></div>
 </>;
}

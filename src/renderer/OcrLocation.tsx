import {useEffect,useMemo,useRef} from 'react';
import type {PageAsset} from '../shared/types';
import type {OcrDocument,OcrMode} from '../shared/ocr';
import {ocrLocation} from './ocrLocationModel';
import {OcrLocationImage} from './OcrLocationImage';
export function OcrLocation({chapterId,page,lineId,onClose,ocrDocument=page?.ocr,source='whole'}:{chapterId:string;page:PageAsset|undefined;lineId:string;onClose:()=>void;ocrDocument?:OcrDocument|null;source?:OcrMode}){
 const close=useRef<HTMLButtonElement>(null),previous=useRef<HTMLElement|null>(null),modal=useRef<HTMLElement>(null);
 const loc=useMemo(()=>ocrLocation(page,lineId,ocrDocument),[page,lineId,ocrDocument]);
 useEffect(()=>{previous.current=document.activeElement instanceof HTMLElement?document.activeElement:null;close.current?.focus();return()=>{if(previous.current?.isConnected)previous.current.focus()}},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose()}else if(e.key==='Tab'){
  const buttons=[...modal.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')||[]],first=buttons[0],last=buttons.at(-1);
  if(first&&((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)||!modal.current?.contains(document.activeElement))){e.preventDefault();(e.shiftKey?last:first)?.focus()}
 }};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[onClose]);
 return <div className="modal-backdrop"><section ref={modal} className="modal ocr-location" role="dialog" aria-modal="true" aria-labelledby="ocr-location-title"><header className="modal-head"><h2 id="ocr-location-title">原文位置核对</h2><button ref={close} aria-label="关闭原文位置核对" onClick={onClose}>关闭</button></header>
 {!loc||!page?<p className="assist-warning">原文来源或位置记录已变化，旧位置已隐藏。关闭后重新查看原文。</p>:<><p className="assist-note">{source==='refine'?'局部增强候选 · 待复核':'整页原文'}</p><p className="ocr-location-text">{loc.line.text}</p><p className="assist-note">模型分数 {Math.round(loc.line.confidence*100)}%{loc.line.needsReview?' · 待复核':''} · 原图 {page.width} × {page.height}。彩色框仅表示文字检测位置，不代表气泡或人物边界。</p>
 <OcrLocationImage key={JSON.stringify([chapterId,page.id,page.hash,page.width,page.height,source,ocrDocument?.cacheKey])} src={`${window.reader.imageUrl(chapterId,page.id)}?ocr-image=${encodeURIComponent(page.hash)}`} loc={loc} onRetryFocus={()=>close.current?.focus()}/>
 <p className="assist-note">只读取已缓存原图，不重新识别、不调用 AI，也不改变阅读页格或缩放。</p></>}
 </section></div>;
}

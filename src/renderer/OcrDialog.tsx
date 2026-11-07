import {useEffect,useState} from 'react';
import type {ChapterManifest} from '../shared/types';
import type {OcrMode} from '../shared/ocr';
import {Icon} from './Icons';
export function OcrDialog({chapter,current,onClose,onError}:{chapter:ChapterManifest;current:number;onClose:()=>void;onError:(e:unknown)=>void}){
 const [from,setFrom]=useState(1),[to,setTo]=useState(Math.min(10,chapter.pages.length)),[force,setForce]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState<{available:boolean;message:string}|null>(null);
 const [mode,setMode]=useState<OcrMode>('whole');
 useEffect(()=>{let alive=true;window.reader.ocrStatus().then(s=>{if(alive)setStatus(s)}).catch(onError);return()=>{alive=false}},[onError]);
 const valid=Number.isInteger(from)&&Number.isInteger(to)&&from>=1&&to>=from&&to<=chapter.pages.length;
 const start=async()=>{setBusy(true);try{await window.reader.recognizeText(chapter.id,from-1,to-1,force,mode);onClose()}catch(e){onError(e)}finally{setBusy(false)}};
 return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="ocr-title"><header className="modal-head"><h2 id="ocr-title">识别漫画原文</h2><button aria-label="关闭原文识别设置" disabled={busy} onClick={onClose}><Icon name="close"/></button></header>
 <p className="subtle">本地专用 OCR，不需要 API Key，不上传图片。默认前 10 页；文字仍可能误读，模型分数不是准确率。</p><p role="status">{status?.message||'正在检查本地 OCR 资源…'}</p>
 <label className="field">OCR 处理方式<select value={mode} disabled={busy} onChange={e=>setMode(e.target.value as OcrMode)}><option value="whole">整页原文 · 默认</option><option value="refine">局部增强候选 · 待复核</option></select></label>
 {mode==='refine'&&<p className="settings-note">整页原文独立保留；缺少整页缓存时先识别整页，再按当前分镜裁图增强。每页最多 6 个裁区，跳过整页图或超预算区域；无可用分镜时不额外裁图。候选可能增加噪声，完成后在原文旁栏切换核对，不代表准确率提升。</p>}
 <div className="range-presets"><button onClick={()=>{setFrom(current+1);setTo(current+1)}}>当前页</button><button onClick={()=>{setFrom(1);setTo(Math.min(10,chapter.pages.length))}}>前 10 页</button><button onClick={()=>{setFrom(1);setTo(chapter.pages.length)}}>整个章节</button></div>
 <div className="form-grid"><label className="field">OCR 起始页<input type="number" min="1" max={chapter.pages.length} value={from} onChange={e=>setFrom(e.target.valueAsNumber)}/></label><label className="field">OCR 结束页<input type="number" min={from} max={chapter.pages.length} value={to} onChange={e=>setTo(e.target.valueAsNumber)}/></label></div>
 <label className="checkbox-field"><input type="checkbox" checked={force} onChange={e=>setForce(e.target.checked)}/>{mode==='refine'?'重新生成局部候选（保留有效整页原文）':'重新识别已有原文（忽略缓存）'}</label>
 <p className="settings-note">已有有效结果直接使用缓存。逐页保存；暂停会等待当前页完成，取消会终止计算且保留已保存页。重启后点击继续，不自动重算。不改变人工分镜、云端事实或解说。</p>
 <footer className="modal-actions"><button disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy||!valid||!status?.available} onClick={start}>{busy?'提交中…':'开始本地识别'}</button></footer></section></div>;
}

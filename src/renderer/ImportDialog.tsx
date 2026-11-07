import { useRef, useState } from 'react';
import type { ChapterManifest } from '../shared/types';
import { Icon } from './Icons';
export function ImportDialog({onClose,onImported,onError}:{onClose:()=>void;onImported:(c:ChapterManifest)=>void;onError:(e:unknown)=>void}){
 const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[pdfJob,setPdfJob]=useState(false),[paused,setPaused]=useState(false);
 const control=useRef({paused:false,cancelled:false});
 const images=async()=>{setBusy(true);setStatus('请选择要导入的图片…');try{const c=await window.reader.importImages();if(c){onImported(c);onClose()}}catch(e){onError(e)}finally{setBusy(false);setStatus('')}};
 const remote=async()=>{setBusy(true);setStatus('正在创建章节采集任务…');try{const c=await window.reader.importUrl(url.trim());onImported(c);onClose()}catch(e){onError(e)}finally{setBusy(false);setStatus('')}};
 const pdf=async()=>{
  setBusy(true);setStatus('请选择 PDF 文件…');control.current={paused:false,cancelled:false};
  let loadingTask:import('pdfjs-dist').PDFDocumentLoadingTask|undefined;
  try{
   const input=await window.reader.pickPdf();if(!input)return;
   setPdfJob(true);setStatus('正在打开 PDF…');
   const [pdfjs,worker]=await Promise.all([import('pdfjs-dist'),import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
   pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
   loadingTask=pdfjs.getDocument({data:new Uint8Array(input.bytes)}); const pdfDocument=await loadingTask.promise;
   let chapter=await window.reader.createPdf(input.name);onImported(chapter);
   for(let i=1;i<=pdfDocument.numPages;i++){
    while(control.current.paused&&!control.current.cancelled)await new Promise(resolve=>setTimeout(resolve,100));
    if(control.current.cancelled){setStatus('已停止；已转换的页面保留在书架。');return;}
    setStatus(`正在转换 PDF · ${i} / ${pdfDocument.numPages} 页`);
    const page=await pdfDocument.getPage(i), original=page.getViewport({scale:1});
    const viewport=page.getViewport({scale:Math.min(2,2200/Math.max(original.width,original.height))});
    const canvas=documentCanvas();canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    const context=canvas.getContext('2d');if(!context)throw new Error('图像画布初始化失败');
    await page.render({canvas,canvasContext:context,viewport}).promise;
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PDF 页面转换失败')),'image/png'));
    chapter=await window.reader.addPdfPage(chapter.id,i-1,new Uint8Array(await blob.arrayBuffer()));
    page.cleanup();canvas.width=0;canvas.height=0;onImported(chapter);
   }
   chapter=await window.reader.finishPdf(chapter.id,pdfDocument.numPages);onImported(chapter);onClose();
  }catch(e){onError(e);setStatus('PDF 导入中断，已转换页面保留在书架。')}finally{if(loadingTask)await loadingTask.destroy().catch(()=>{});setBusy(false);setPdfJob(false);setPaused(false)}
 };
 return <div className="modal-backdrop"><section className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><header className="modal-head"><div><span className="eyebrow">ADD A NEW STORY</span><h2 id="import-title">导入漫画</h2></div><button className="icon-button" aria-label="关闭导入" disabled={busy} onClick={onClose}><Icon name="close"/></button></header><p className="subtle">从本地文件开始，或添加一个章节链接。</p><div className="import-options"><button onClick={images} disabled={busy}><span className="feature-icon"><Icon name="image"/></span><strong>本地图片</strong><small>多选 JPG、PNG、WebP 等图片</small><span className="text-link">选择图片 <Icon name="arrow"/></span></button><button onClick={pdf} disabled={busy}><span className="feature-icon"><Icon name="file"/></span><strong>PDF 漫画</strong><small>逐页转换，原始文件保持不变</small><span className="text-link">选择 PDF <Icon name="arrow"/></span></button></div><div className="or-divider"><span/>或导入在线章节<span/></div><label className="field">copy4000 章节链接<div className="url-input"><Icon name="link"/><input value={url} disabled={busy} onChange={e=>setUrl(e.target.value)} placeholder="粘贴单个漫画章节的完整链接" aria-label="章节链接"/><button className="primary" onClick={remote} disabled={busy||!url.trim()}>导入章节</button></div><small>采集进度将在阅读页显示；遇到验证时可打开来源页处理后继续。</small></label>{status&&<div className="import-status" role="status">{busy&&<span className="spinner"/>}{status}</div>}{pdfJob&&<div className="button-row"><button onClick={()=>{control.current.paused=!control.current.paused;setPaused(control.current.paused)}}>{paused?'继续转换':'暂停转换'}</button><button onClick={()=>{control.current.cancelled=true;control.current.paused=false}}>停止转换</button></div>}<footer className="modal-note"><Icon name="check"/>导入不会自动开始云端分析，也不会产生模型调用。</footer></section></div>
}
function documentCanvas(){return window.document.createElement('canvas')}


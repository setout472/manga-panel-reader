import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChapterManifest, Job, Settings as SettingsType } from '../shared/types';
import { Bookshelf } from './Bookshelf';
import { ImportDialog } from './ImportDialog';
import { Icon } from './Icons';
import { Reader } from './Reader';
import { Settings } from './Settings';
import { chapterJobs } from './jobModel';

export function App(){
 const [chapters,setChapters]=useState<ChapterManifest[]>([]),[settings,setSettings]=useState<SettingsType|null>(null),[view,setView]=useState<'shelf'|'reader'|'settings'>('shelf'),[selected,setSelected]=useState<string|null>(null),[jobs,setJobs]=useState<Record<string,Job>>({}),[importing,setImporting]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const refreshId=useRef(0),alive=useRef(true);
 const onError=useCallback((e:unknown)=>setError(e instanceof Error?e.message:String(e)),[]);
 const refresh=useCallback(async()=>{const id=++refreshId.current;try{const next=await window.reader.listChapters();if(alive.current&&id===refreshId.current)setChapters(next)}catch(e){if(alive.current)onError(e)}finally{if(alive.current)setLoading(false)}},[onError]);
 useEffect(()=>{alive.current=true;void refresh();void window.reader.getSettings().then(s=>{if(alive.current)setSettings(s)}).catch(onError);let timer:ReturnType<typeof setTimeout>|undefined;
  const unsubscribe=window.reader.onUpdate(event=>{if(event.job)setJobs(j=>({...j,[`${event.chapterId}:${event.job!.kind}`]:event.job!}));if(timer)clearTimeout(timer);timer=setTimeout(()=>void refresh(),100)});
  return()=>{alive.current=false;unsubscribe();if(timer)clearTimeout(timer)};
 },[refresh,onError]);
 const updated=useCallback((chapter:ChapterManifest)=>{++refreshId.current;setChapters(list=>list.some(c=>c.id===chapter.id)?list.map(c=>c.id===chapter.id?chapter:c):[chapter,...list])},[]);
 const open=(id:string)=>{setSelected(id);setView('reader')};
 const chapter=chapters.find(c=>c.id===selected);
 const totalPages=chapters.reduce((n,c)=>n+c.pages.length,0);
 return <div className="app-shell"><aside className="app-sidebar"><a className="brand" href="#" onClick={e=>{e.preventDefault();setView('shelf')}} aria-label="逐格，返回书架"><span className="brand-mark"><Icon name="grid" width="25" height="25"/></span><span>逐格<small>MANGA STUDIO</small></span></a><div className="sidebar-label">你的阅读空间</div><nav aria-label="主导航"><button className={view==='shelf'?'active':''} onClick={()=>setView('shelf')}><Icon name="book"/>我的书架<span>{chapters.length}</span></button>{chapter&&<button className={view==='reader'?'active':''} onClick={()=>setView('reader')}><Icon name="play"/>继续阅读</button>}<button onClick={()=>setImporting(true)}><Icon name="plus"/>导入漫画</button></nav><div className="sidebar-bottom"><div className="library-summary"><span className="status-dot"/>本地资料库<small>{chapters.length} 部漫画 · {totalPages} 页故事</small></div><button className={`sidebar-settings ${view==='settings'?'active':''}`} onClick={()=>setView('settings')}><Icon name="settings"/>阅读设置</button><div className="sidebar-foot">故事在眼前，节奏在你手中。<span>逐格 / v0.2.1 预览</span></div></div></aside><main className={`app-main ${view==='reader'?'reader-main':''}`}>
 {view==='shelf'&&(loading?<div className="loading-state" role="status"><span className="spinner"/>正在打开你的书架…</div>:<Bookshelf chapters={chapters} onOpen={open} onImport={()=>setImporting(true)}/>)}
 {chapter&&<div className="reader-mount" hidden={view!=='reader'}><Reader key={chapter.id} active={view==='reader'} chapter={chapter} settings={settings} jobs={chapterJobs(chapter,Object.values(jobs))} onBack={()=>{setView('shelf');void refresh()}} onUpdated={updated} onSettings={()=>setView('settings')} onError={onError}/></div>}
 {view==='settings'&&(settings?<Settings settings={settings} onSaved={setSettings} onError={onError}/>:<div className="loading-state"><p>设置尚未加载。</p><button onClick={()=>void window.reader.getSettings().then(setSettings).catch(onError)}>重试加载</button></div>)}
 </main>{error&&<div className="error-toast" role="alert"><span><strong>操作未完成</strong>{error}</span><button className="icon-button" aria-label="关闭错误提示" onClick={()=>setError('')}><Icon name="close"/></button></div>}{importing&&<ImportDialog onClose={()=>setImporting(false)} onImported={c=>{updated(c);open(c.id)}} onError={onError}/>}</div>
}



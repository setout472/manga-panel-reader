import { useRef, useState, type PointerEvent } from 'react';
import type { ChapterManifest, PageAsset, Panel, Rect } from '../shared/types';
import { Icon } from './Icons';
import { clampRect, commitHistory, createHistory, effectivePanels, mergePanels, ordered, redoHistory, reorderPanel, undoHistory, type History } from './editorModel';
type Drag={kind:'move'|'draw'|'nw'|'ne'|'sw'|'se';x:number;y:number;panels:Panel[];ids:string[]};
export function PanelEditor({chapter,page,onClose,onSaved,onError}:{chapter:ChapterManifest;page:PageAsset;onClose:()=>void;onSaved:(c:ChapterManifest)=>void;onError:(e:unknown)=>void}){
 const [history,setHistory]=useState<History>(()=>createHistory(effectivePanels(page)));
 const [saved,setSaved]=useState(()=>JSON.stringify(ordered(effectivePanels(page))));
 const [selected,setSelected]=useState<string[]>([]),[tool,setTool]=useState<'select'|'draw'>('select'),[preview,setPreview]=useState<Panel[]|null>(null),[busy,setBusy]=useState(false),[savedMessage,setSavedMessage]=useState('');
 const svg=useRef<SVGSVGElement>(null),drag=useRef<Drag|null>(null),previewRef=useRef<Panel[]|null>(null);
 const panels=preview??history.present,dirty=JSON.stringify(ordered(history.present))!==saved;
 const setDraft=(p:Panel[]|null)=>{previewRef.current=p;setPreview(p)};
 const commit=(p:Panel[])=>{setHistory(h=>commitHistory(h,p));setSavedMessage('')};
 const point=(e:PointerEvent)=>{const matrix=svg.current?.getScreenCTM();if(!matrix)return {x:0,y:0};const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return {x:Math.max(0,Math.min(1,p.x/page.width)),y:Math.max(0,Math.min(1,p.y/page.height))}};
 const start=(e:PointerEvent,kind:Drag['kind'],id?:string)=>{
  if(busy||e.button!==0)return;e.preventDefault();e.stopPropagation();
  if(id&&(e.ctrlKey||e.metaKey||e.shiftKey)){setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);return;}
  const ids=id?(selected.includes(id)?selected:[id]):[];
  if(id)setSelected(ids);else if(tool==='select'){setSelected([]);return;}
  const p=point(e);drag.current={kind,x:p.x,y:p.y,panels:history.present.map(v=>({...v})),ids};
  if(kind==='draw'){const newId=crypto.randomUUID();drag.current.ids=[newId];setDraft([...history.present,{id:newId,order:history.present.length+1,x:p.x,y:p.y,width:.001,height:.001}])}
  svg.current?.setPointerCapture(e.pointerId);
 };
 const move=(e:PointerEvent)=>{
  const d=drag.current;if(!d)return;const p=point(e),dx=p.x-d.x,dy=p.y-d.y;
  if(d.kind==='draw'){setDraft([...d.panels,{id:d.ids[0],order:d.panels.length+1,x:Math.min(p.x,d.x),y:Math.min(p.y,d.y),width:Math.max(.001,Math.abs(dx)),height:Math.max(.001,Math.abs(dy))}]);return;}
  setDraft(d.panels.map(panel=>{
   if(!d.ids.includes(panel.id))return panel;
   let next:Rect;
   if(d.kind==='move')next=clampRect({...panel,x:panel.x+dx,y:panel.y+dy});
   else{
    let left=panel.x,top=panel.y,right=panel.x+panel.width,bottom=panel.y+panel.height;
    if(d.kind.includes('w'))left=Math.min(right-.01,Math.max(0,p.x));else right=Math.max(left+.01,Math.min(1,p.x));
    if(d.kind.includes('n'))top=Math.min(bottom-.01,Math.max(0,p.y));else bottom=Math.max(top+.01,Math.min(1,p.y));
    next=clampRect({x:left,y:top,width:right-left,height:bottom-top});
   }
   return {...panel,...next};
  }));
 };
 const end=(e:PointerEvent)=>{const d=drag.current;if(!d)return;const next=previewRef.current;drag.current=null;if(svg.current?.hasPointerCapture(e.pointerId))svg.current.releasePointerCapture(e.pointerId);if(next){const added=next.at(-1);if(d.kind!=='draw'||(added&&added.width>=.01&&added.height>=.01)){commit(next);setSelected(d.ids)}}setDraft(null)};
 const close=()=>{if(!dirty||window.confirm('有尚未保存的分镜调整。确定放弃并关闭？'))onClose()};
 const save=async()=>{setBusy(true);try{const next=await window.reader.savePanels(chapter.id,page.id,ordered(history.present));setSaved(JSON.stringify(ordered(history.present)));setSavedMessage('分镜与阅读顺序已保存');onSaved(next)}catch(e){onError(e)}finally{setBusy(false)}};
 const reset=async()=>{if(!window.confirm('恢复此页的自动分析结果？手动覆盖将被移除。'))return;setBusy(true);try{const next=await window.reader.savePanels(chapter.id,page.id,null);const found=next.pages.find(p=>p.id===page.id);const result=found?effectivePanels(found):[];setHistory(createHistory(result));setSaved(JSON.stringify(ordered(result)));setSelected([]);setSavedMessage('已恢复自动结果');onSaved(next)}catch(e){onError(e)}finally{setBusy(false)}};
 const deleteSelected=()=>{commit(history.present.filter(p=>!selected.includes(p.id)));setSelected([])};
 const merge=()=>{const id=crypto.randomUUID();commit(mergePanels(history.present,selected,id));setSelected([id])};
 const focused=panels.find(p=>p.id===selected[0]);
 return <div className="modal-backdrop editor-backdrop"><section className="panel-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title"><header className="editor-head"><div><span className="eyebrow">PANEL STUDIO</span><h2 id="editor-title">分镜编辑 <span>第 {page.index+1} 页</span>{dirty&&<small className="unsaved">未保存</small>}</h2></div><div className="button-row"><button disabled={busy} onClick={reset}>恢复自动结果</button><button className="primary" disabled={busy||history.present.length===0} onClick={save}><Icon name="check"/>{busy?'保存中…':'保存分镜'}</button><button aria-label="关闭编辑器" className="icon-button" disabled={busy} onClick={close}><Icon name="close"/></button></div></header><div className="editor-tools"><div className="segmented"><button className={tool==='select'?'active':''} onClick={()=>setTool('select')}>选择 / 移动</button><button className={tool==='draw'?'active':''} onClick={()=>setTool('draw')}><Icon name="plus"/>绘制分镜</button></div><span className="toolbar-divider"/><button disabled={!history.past.length||busy} onClick={()=>{setHistory(undoHistory);setSelected([])}} title="撤销"><Icon name="undo"/>撤销</button><button disabled={!history.future.length||busy} onClick={()=>{setHistory(redoHistory);setSelected([])}} title="重做"><Icon name="redo"/>重做</button><span className="toolbar-divider"/><button disabled={!selected.length||busy} onClick={deleteSelected}><Icon name="trash"/>删除</button><button disabled={selected.length<2||busy} onClick={merge}><Icon name="merge"/>合并所选</button><span className="editor-hint">Shift / Ctrl 多选 · 拖动角点缩放</span></div><div className="editor-body"><div className={`editor-stage ${tool==='draw'?'drawing':''}`}><svg ref={svg} viewBox={`0 0 ${page.width} ${page.height}`} preserveAspectRatio="xMidYMid meet" onPointerDown={e=>start(e,'draw')} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{drag.current=null;setDraft(null)}} aria-label="分镜编辑画布"><image href={window.reader.imageUrl(chapter.id,page.id)} x="0" y="0" width={page.width} height={page.height} preserveAspectRatio="none" onError={()=>onError(new Error('漫画图片加载失败'))}/>{panels.map((p,i)=>{
 const x=p.x*page.width,y=p.y*page.height,w=p.width*page.width,h=p.height*page.height,active=selected.includes(p.id),handle=page.width*.014;
 return <g key={p.id}><rect className={`panel-rect ${active?'selected':''}`} x={x} y={y} width={w} height={h} strokeWidth={Math.max(2,page.width*.0025)} onPointerDown={e=>tool==='draw'?start(e,'draw'):start(e,'move',p.id)}/><rect x={x} y={y} width={page.width*.045} height={page.width*.04} fill={active?'#f39360':'#24272b'} pointerEvents="none"/><text x={x+page.width*.0225} y={y+page.width*.029} fontSize={page.width*.025} fill={active?'#15171b':'#fff'} textAnchor="middle" fontWeight="bold" pointerEvents="none">{i+1}</text>{active&&tool==='select'&&(['nw','ne','sw','se'] as const).map(corner=><rect key={corner} className={`resize-handle ${corner}`} x={(corner.includes('w')?x:x+w)-handle/2} y={(corner.includes('n')?y:y+h)-handle/2} width={handle} height={handle} fill="#ffd6bd" stroke="#b85428" strokeWidth={1.5} onPointerDown={e=>start(e,corner,p.id)}/>)}</g>
 })}</svg></div><aside className="editor-sidebar"><div className="editor-sidebar-title"><h3>阅读顺序</h3><span>{panels.length} 格</span></div><p className="subtle">拖动列表调整顺序，点击选中分镜。</p><div className="panel-order-list">{panels.map((p,i)=><div key={p.id} className={`panel-order-item ${selected.includes(p.id)?'selected':''}`} draggable={!busy} onDragStart={e=>{e.dataTransfer.setData('text/panel-id',p.id);e.dataTransfer.effectAllowed='move'}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();commit(reorderPanel(history.present,e.dataTransfer.getData('text/panel-id'),p.id))}}><button className="panel-select" onClick={e=>setSelected(s=>e.shiftKey||e.ctrlKey||e.metaKey?(s.includes(p.id)?s.filter(x=>x!==p.id):[...s,p.id]):[p.id])}><Icon name="grip"/><span className="order-number">{i+1}</span><span>分镜 {i+1}<small>{Math.round(p.width*page.width)} × {Math.round(p.height*page.height)}</small></span></button><button className="order-step" aria-label={`分镜 ${i+1} 上移`} disabled={i===0||busy} onClick={()=>commit(reorderPanel(history.present,p.id,panels[i-1].id))}>↑</button><button className="order-step" aria-label={`分镜 ${i+1} 下移`} disabled={i===panels.length-1||busy} onClick={()=>commit(reorderPanel(history.present,p.id,panels[i+1].id))}>↓</button></div>)}</div>{panels.length===0&&<div className="editor-empty">选择「绘制分镜」，<br/>在页面上拖出第一格。</div>}{focused&&selected.length===1&&<div className="precise-fields"><h3>精确调整 <small>%</small></h3><div className="form-grid">{(['x','y','width','height'] as const).map(key=><label className="field" key={key}>{{x:'左边距',y:'上边距',width:'宽度',height:'高度'}[key]}<input type="number" min={key==='width'||key==='height'?1:0} max="100" step="0.1" value={Number((focused[key]*100).toFixed(2))} onChange={e=>{const val=e.target.valueAsNumber;if(Number.isFinite(val))commit(history.present.map(p=>p.id===focused.id?{...p,...clampRect({...p,[key]:val/100})}:p))}}/></label>)}</div></div>}<div className="editor-save-status" role="status">{savedMessage||'调整只在保存后写入本地资料库。'}</div></aside></div><footer className="editor-footer"><span>{selected.length?`已选择 ${selected.length} 个分镜`:'未选择分镜'}</span><span>自动结果保留 · 手动调整独立保存 · 最多 50 步撤销</span></footer></section></div>
}

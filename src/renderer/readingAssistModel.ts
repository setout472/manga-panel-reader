import type {ChapterManifest,ReadingProgress} from '../shared/types';
import type {PanelFact} from '../shared/story';
import type {OcrDocument} from '../shared/ocr';
import {effectivePanels} from './editorModel';
import {ocrForReading} from './ocrReadingModel';

export function readingAssist(chapter:ChapterManifest,progress:ReadingProgress,ocrDocument:OcrDocument|null|undefined=chapter.pages[progress.page]?.ocr){
 const page=chapter.pages[progress.page];
 const ids=(page?effectivePanels(page):[]).map(p=>p.id);
 if(!ids.length)ids.push('whole-page');
 const currentId=ids[Math.max(0,Math.min(ids.length-1,progress.panel))];
 const content=page?.content;
 const valid=content?.pageId===page?.id&&content?.panels.length===ids.length&&new Set(content?.panels.map(p=>p.panelId)).size===ids.length&&content?.panels.every(p=>ids.includes(p.panelId));
 const factState: 'ready'|'missing'|'stale'=!content?'missing':valid?'ready':'stale';
 const facts:PanelFact[]=valid?ids.flatMap(id=>content!.panels.filter(p=>p.panelId===id&&(progress.mode==='page'||id===currentId))):[];
 let hiddenLater=0;
 const blocks=chapter.storyStale||factState==='stale'?[]:(chapter.story?.blocks||[]).filter(block=>{
  if(!page||!block.panelRefs.some(ref=>ref.pageId===page.id&&(progress.mode==='page'||ref.panelId===currentId)))return false;
  const positions=block.panelRefs.map(ref=>{
   const pageIndex=chapter.pages.findIndex(p=>p.id===ref.pageId);if(pageIndex<0)return null;
   const panelIds=effectivePanels(chapter.pages[pageIndex]).map(p=>p.id);if(!panelIds.length)panelIds.push('whole-page');
   const panelIndex=panelIds.indexOf(ref.panelId);return panelIndex<0?null:{pageIndex,panelIndex};
  });
  if(!positions.length||positions.some(p=>p===null))return false;
  if(positions.some(p=>p!.pageIndex>progress.page||(progress.mode==='panel'&&p!.pageIndex===progress.page&&p!.panelIndex>ids.indexOf(currentId)))){hiddenLater++;return false}
  return true;
 });
 const panels=page?effectivePanels(page):[];if(!panels.length)panels.push({id:'whole-page',order:1,x:0,y:0,width:1,height:1});
 return {facts,factState,blocks,hiddenLater,summary:valid&&progress.mode==='page'?content?.summary:undefined,needsReview:content?.needsReview??false,model:content?.model,storyStale:chapter.storyStale===true,ocr:ocrForReading(page,panels,progress.mode,currentId,chapter.direction,ocrDocument)};
}

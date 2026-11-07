import type { PageAsset, ReadingProgress } from '../shared/types';
import type { PanelRef } from '../shared/story';
import { effectivePanels } from './editorModel';
export const validStoryRange=(from:number,to:number,total:number)=>Number.isInteger(from)&&Number.isInteger(to)&&from>=1&&to>=from&&to<=total;
export function referenceProgress(pages:PageAsset[],ref:PanelRef):ReadingProgress|null{
 const page=pages.findIndex(p=>p.id===ref.pageId);if(page<0)return null;
 const panel=effectivePanels(pages[page]).findIndex(p=>p.id===ref.panelId);
 return {page,panel:Math.max(0,panel),mode:panel<0?'page':'panel',zoom:1};
}

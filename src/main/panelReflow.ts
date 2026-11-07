import type {Analysis,Rect} from '../shared/types';
import {validatePanels} from '../core/panels';
import {buildReadingCrops} from '../core/readingCrop';
import {orderPanelFrames} from '../core/panelReadingOrder';
import {RTDETR_ADAPTER_VERSION} from '../core/rtdetrPanels';
import {PANEL_MODEL} from './panelAssets';
export const LEGACY_PANEL_MODEL='rtdetr-manga109s-fba50583-native1243-xycut1-rgb1';
function regions(value:unknown):Rect[]{if(!Array.isArray(value)||value.length>1000)throw Error('Invalid region count');return value.map(r=>{if(!r||!['x','y','width','height'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>1.000001||r.y+r.height>1.000001)throw Error('Invalid region');return {x:r.x,y:r.y,width:r.width,height:r.height}})}
/** Reprocess only an exact same-image/direction legacy cache. Keep it immutable. */
export function reflowPanelAnalysis(old:Analysis|undefined,expectedKey:string,key:string,direction:'rtl'|'ltr'):Analysis|undefined{
 try{if(!old||old.error||old.cacheKey!==expectedKey||old.model!==LEGACY_PANEL_MODEL||old.layout?.version!=='rtdetr-original-xycut-v1')return;
  const layout=old.layout,ordered=orderPanelFrames(validatePanels(layout.framePanels),direction),framePanels=ordered.panels.map((p,i)=>({...p,order:i+1})),textRegions=regions(layout.textRegions),bodyRegions=regions(layout.bodyRegions),reading=buildReadingCrops(framePanels,textRegions,bodyRegions);
  return {panels:validatePanels(reading.panels),needsReview:true,model:PANEL_MODEL,cacheKey:key,durationMs:0,layout:{framePanels,textRegions,bodyRegions,unassignedTextRegions:reading.unassignedTextRegions,orderUncertain:ordered.uncertain,version:RTDETR_ADAPTER_VERSION}};
 }catch{return}
}

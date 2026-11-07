import {contextBridge,ipcRenderer} from 'electron';
import type {ReaderAPI} from '../shared/types';
const call=(method:string,...args:unknown[])=>ipcRenderer.invoke('reader:'+method,...args);
const api:ReaderAPI={
 saveReadingNote:(id,pageId,hash,version,text)=>call('saveReadingNote',id,pageId,hash,version,text),
 recognizeText:(id,from,to,force,mode)=>call('recognizeText',id,from,to,force,mode),ocrStatus:()=>call('ocrStatus'),
 getOcrRefinement:(id,pageId)=>call('getOcrRefinement',id,pageId),
 listChapters:()=>call('listChapters'),getChapter:id=>call('getChapter',id),importImages:()=>call('importImages'),pickPdf:()=>call('pickPdf'),createPdf:name=>call('createPdf',name),addPdfPage:(id,index,png)=>call('addPdfPage',id,index,png),finishPdf:(id,total)=>call('finishPdf',id,total),importUrl:url=>call('importUrl',url),continueCollection:id=>call('continueCollection',id),analyze:(id,from,to,force)=>call('analyze',id,from,to,force),controlJob:(id,kind,action)=>call('controlJob',id,kind,action),showSource:id=>call('showSource',id),savePanels:(id,pageId,panels)=>call('savePanels',id,pageId,panels),saveProgress:(id,progress)=>call('saveProgress',id,progress),setDirection:(id,direction)=>call('setDirection',id,direction),getSettings:()=>call('getSettings'),saveSettings:value=>call('saveSettings',value),
 panelModelStatus:()=>call('panelModelStatus'),
 analyzeLocal:(id,from,to)=>call('analyzeLocal',id,from,to),generateStory:(id,from,to,engine)=>call('generateStory',id,from,to,engine),localModelStatus:()=>call('localModelStatus'),
 onUpdate:cb=>{const handler=(_e:Electron.IpcRendererEvent,event:any)=>cb(event);ipcRenderer.on('reader:update',handler);return ()=>ipcRenderer.removeListener('reader:update',handler)},
 imageUrl:(chapterId,pageId)=>`manga://asset/${encodeURIComponent(chapterId)}/${encodeURIComponent(pageId)}`
};
contextBridge.exposeInMainWorld('reader',api);

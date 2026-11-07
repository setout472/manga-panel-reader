import {useEffect,useState} from 'react';import type {PageAsset} from '../shared/types';import type {OcrRefinementView} from '../shared/ocr';import {ocrRefinementIdentity,selectedRefinementDocument} from '../shared/ocrView';
export function useOcrRefinement(chapterId:string,page:PageAsset|undefined,enabled:boolean){
 const sourceIdentity=enabled&&page?ocrRefinementIdentity(page):'',identity=sourceIdentity?JSON.stringify([chapterId,sourceIdentity]):'',pageId=page?.id;
 const [response,setResponse]=useState<{identity:string;view:OcrRefinementView|null;state:'loading'|'ready'|'unavailable'}|null>(null);
 useEffect(()=>{
  if(!identity||!pageId){setResponse(null);return}let alive=true;setResponse({identity,view:null,state:'loading'});
  void window.reader.getOcrRefinement(chapterId,pageId).then(view=>{if(alive)setResponse({identity,view,state:view&&view.identity===sourceIdentity?'ready':'unavailable'})}).catch(()=>{if(alive)setResponse({identity,view:null,state:'unavailable'})});
  return()=>{alive=false};
 },[chapterId,pageId,identity,sourceIdentity]);
 const current=response?.identity===identity?response:null,document=enabled?selectedRefinementDocument(page,current?.view):null;
 return {document,state:document?'ready' as const:current?.state==='unavailable'?'unavailable' as const:'loading' as const,cropCount:document?current!.view!.cropCount:0,skippedCount:document?current!.view!.skippedCount:0};
}

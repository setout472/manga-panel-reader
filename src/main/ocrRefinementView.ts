import type {PageAsset} from '../shared/types';import type {OcrRefinementView} from '../shared/ocr';import {ocrRefinementIdentity} from '../shared/ocrView';import {refinementIsCached} from '../core/ocrRefinementCache';
export function refinementView(page:PageAsset|undefined):OcrRefinementView|null{
 if(!page||!refinementIsCached(page))return null;
 const result=page.ocrRefinement!.result;
 return {identity:ocrRefinementIdentity(page),document:structuredClone(result.document),cropCount:result.plan.crops.length,skippedCount:result.plan.skipped.length};
}

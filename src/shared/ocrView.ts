import type {PageAsset} from './types';import type {OcrDocument,OcrRefinementView} from './ocr';
// Identity, not a checksum verifier. Verification lives in the main process;
// exact snapshot equality prevents asynchronous responses crossing source edits.
export const ocrRefinementIdentity=(page:PageAsset)=>JSON.stringify([page.id,page.hash,page.width,page.height,page.ocr,page.override!==undefined?page.override?.panels:page.analysis?.panels,page.ocrRefinement]);
export function selectedRefinementDocument(page:PageAsset|undefined,view:OcrRefinementView|null|undefined):OcrDocument|null{
 return page&&view&&view.identity===ocrRefinementIdentity(page)?view.document:null;
}

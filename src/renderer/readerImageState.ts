export type ReaderImageStatus='loading'|'ready'|'error';
export function readerImageTransition(status:ReaderImageStatus,event:'load'|'error'|'timeout'):ReaderImageStatus{
 if(event==='error')return 'error';
 if(status!=='loading')return status;
 return event==='load'?'ready':'error';
}

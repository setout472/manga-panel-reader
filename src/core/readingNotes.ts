import {z} from 'zod';
import type {PageAsset} from '../shared/types';import type {ReadingNote} from '../shared/readingNotes';
const revision=z.object({text:z.string().max(12000),version:z.number().int().min(1).max(1000000000),updatedAt:z.string().min(1).max(100)}).strict();
const schema=revision.extend({source:z.object({pageId:z.string().regex(/^[\w-]{1,80}$/),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),history:z.array(revision).max(10)}).strict();
export function readingNoteView(page:PageAsset){const parsed=schema.safeParse(page.readingNote);if(!page.readingNote)return {state:'missing' as const,text:'',version:0,history:[] as ReadingNote['history']};if(!parsed.success||parsed.data.source.pageId!==page.id||parsed.data.source.hash!==page.hash)return {state:'stale' as const,text:'',version:parsed.success?parsed.data.version:0,history:[] as ReadingNote['history']};return {state:'ready' as const,text:parsed.data.text,version:parsed.data.version,history:parsed.data.history}}
export function updateReadingNote(page:PageAsset,hash:string,expectedVersion:number,text:string,updatedAt=new Date().toISOString()):ReadingNote{
 z.string().max(12000).parse(text);z.number().int().min(0).max(999999999).parse(expectedVersion);if(hash!==page.hash)throw Error('原图已变化，请重新打开本页后修正');
 const old=page.readingNote?schema.parse(page.readingNote):undefined;if((old?.version??0)!==expectedVersion)throw Error('笔记版本已变化，请载入已保存笔记后再修改');
 const same=old?.source.pageId===page.id&&old.source.hash===page.hash;const history=same?[{text:old.text,version:old.version,updatedAt:old.updatedAt},...old.history].slice(0,10):[];
 return schema.parse({source:{pageId:page.id,hash},text:text.trim(),version:expectedVersion+1,updatedAt,history});
}

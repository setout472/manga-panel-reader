import {z} from 'zod';
import type {PageContent} from './story';

const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
const text=(max:number)=>z.string().trim().min(1).max(max);
const pageRefs=z.array(id).min(1).max(5);
export const wholePageScopeSchema=z.object({
 pages:z.array(z.object({id,pageNumber:z.number().int().min(1),hash:z.string().regex(/^[a-fA-F0-9]{64}$/),width:z.number().int().min(1).max(100000),height:z.number().int().min(1).max(100000)})).min(1).max(5),
 direction:z.enum(['rtl','ltr']),maxImageSide:z.number().int().min(256).max(4096),
 context:z.object({version:text(100),text:z.string().max(8000)}).strict(),
});
export type WholePageScope=z.infer<typeof wholePageScopeSchema>;
export const wholePageOutputSchema=z.object({
 title:text(120),
 characters:z.array(z.object({id,label:text(120),role:z.enum(['present','depicted','unknown']),pageIds:pageRefs}).strict()).max(24),
 events:z.array(z.object({id,actors:z.array(id).max(24),description:text(1000),pageIds:pageRefs,evidence:z.enum(['observed','stated','inferred']),causes:z.array(id).max(24)}).strict()).min(1).max(40),
 blocks:z.array(z.object({id,text:text(2000),eventIds:z.array(id).min(1).max(40)}).strict()).max(24),
 unresolved:z.array(z.object({severity:z.enum(['core','minor']),question:text(500),pageIds:pageRefs}).strict()).max(24),
}).strict();
export type WholePageOutput=z.infer<typeof wholePageOutputSchema>;
export type ValidatedWholePage=Omit<WholePageOutput,'blocks'> & {
 blocks:(WholePageOutput['blocks'][number]&{pageIds:string[]})[];
 needsReview:boolean;semanticStatus:'unverified';
};
export type WholePageUnderstanding=ValidatedWholePage & {
 version:string;sourceKey:string;scopePageIds:string[];direction:'rtl'|'ltr';
 model:string;durationMs:number;usage?:PageContent['usage'];
};

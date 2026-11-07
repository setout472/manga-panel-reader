import {z} from 'zod';
import type {WholePageScope} from './wholePage';
import type {PageContent} from './story';
const text=(n:number)=>z.string().trim().min(1).max(n);
export const sceneEvidenceSchema=z.object({
 pages:z.array(z.object({pageNumber:z.number().int().min(1),persons:z.array(text(160)).max(24),
  dialogue:z.array(z.object({quote:text(2000),speaker:text(160),target:text(160),speakerEvidence:text(600)}).strict()).max(32),
  actions:z.array(z.object({actor:text(160),action:text(1000),target:text(160)}).strict()).max(24),summary:text(2000),
 }).strict()).min(1).max(5),uncertain:z.array(text(600)).max(24),
}).strict();
export const sceneIssueSchema=z.object({pageNumber:z.number().int().min(1),severity:z.enum(['core','minor']),message:text(600)}).strict();
export const sceneReviewSchema=z.object({evidence:sceneEvidenceSchema,issues:z.array(sceneIssueSchema).max(24),needsReview:z.boolean()}).strict();
export type SceneEvidenceOutput=z.infer<typeof sceneEvidenceSchema>;
export type SceneEvidenceIssue=z.infer<typeof sceneIssueSchema>;
export type ValidatedSceneEvidence=Omit<SceneEvidenceOutput,'pages'>&{pages:(SceneEvidenceOutput['pages'][number]&{pageId:string})[];requiresReview:boolean;semanticStatus:'unverified'};
export type SceneEvidenceTrace=ValidatedSceneEvidence&{
 version:string;promptVersion:string;stage:'extracted'|'reviewed'|'assisted';sourceKey:string;contentDigest:string;
 sourceScope:WholePageScope;model:string;durationMs:number;usage?:PageContent['usage'];
 issues:SceneEvidenceIssue[];reviewFlag:boolean;originDigest?:string;
 correction?:{reviewer:'human'|'ai-assisted';version:string;recordDigest:string};
};

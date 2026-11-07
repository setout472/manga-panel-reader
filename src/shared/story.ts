export type PanelRef = {pageId:string;panelId:string};
export type PanelFact = {panelId:string;characters:string[];dialogue:{speaker:string;text:string}[];description:string;uncertainties:string[]};
export type PageContent = {pageId:string;sourceKey:string;panels:PanelFact[];summary:string;needsReview:boolean;model:string;durationMs:number;usage?:{prompt_tokens?:number;completion_tokens?:number;total_tokens?:number}};
export type StoryScene = {id:string;title:string;summary:string;panelRefs:PanelRef[];characters:string[]};
export type NarrationBlock = {id:string;sceneId:string;text:string;panelRefs:PanelRef[]};
export type StoryDraft = {title:string;sourceKey:string;scopePageIds:string[];scenes:StoryScene[];blocks:NarrationBlock[];unresolved:string[];model:string;durationMs:number;updatedAt:string};

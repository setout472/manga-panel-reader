import type { ChapterManifest, Job } from '../shared/types';

/** Reconstruct display state only; restarting never resumes cloud work implicitly. */
export function chapterJobs(chapter:ChapterManifest,liveJobs:Job[]):Job[]{
 const jobs=new Map<Job['kind'],Job>();
 const ocr=chapter.ocrTask;
 if(ocr)jobs.set('ocr',{chapterId:chapter.id,kind:'ocr',state:ocr.state,done:ocr.done,total:ocr.total,message:ocr.message});
 const task=chapter.analysisTask;
 if(task)jobs.set('analyze',{chapterId:chapter.id,kind:'analyze',state:task.state,done:task.done,total:task.total,message:task.message});
 const story=chapter.storyTask;
 if(story)jobs.set('story',{chapterId:chapter.id,kind:'story',state:story.state,done:story.done,total:story.total,message:story.message});
 for(const job of liveJobs){if(job.chapterId===chapter.id)jobs.set(job.kind,job)}
 return [...jobs.values()];
}


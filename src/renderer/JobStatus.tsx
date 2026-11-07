import type { Job } from '../shared/types';
import { Icon } from './Icons';
const states:Record<Job['state'],string>={running:'进行中',paused:'已暂停',cancelled:'已取消',done:'已完成',error:'出现错误'};
export function JobStatus({job,onError}:{job:Job;onError:(e:unknown)=>void}){
 const action=async(a:'pause'|'resume'|'cancel')=>{try{await window.reader.controlJob(job.chapterId,job.kind,a)}catch(e){onError(e)}};
 return <div className={`job-status ${job.state}`} role="status"><div className="job-line"><span>{job.kind==='collect'?'章节采集':job.kind==='story'?'故事解说':job.kind==='ocr'?'本地 OCR':'分镜分析'} · {states[job.state]}</span><span>{job.done} / {job.total||'待确认'}</span></div><div className="progress-track"><i style={{width:`${job.total?Math.min(100,job.done/job.total*100):0}%`}}/></div>{job.message&&<p>{job.message}</p>}<div className="job-controls">{job.state==='running'&&<button onClick={()=>action('pause')}><Icon name="pause"/>暂停</button>}{(job.state==='paused'||(job.kind==='ocr'&&['error','cancelled'].includes(job.state))||(job.kind==='analyze'&&job.state==='cancelled'))&&<button onClick={()=>action('resume')}><Icon name="play"/>继续</button>}{['running','paused'].includes(job.state)&&<button onClick={()=>action('cancel')}><Icon name="stop"/>取消任务</button>}</div></div>
}


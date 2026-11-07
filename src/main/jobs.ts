import type {Job} from '../shared/types';
export class JobControl {
 readonly abort=new AbortController();
 job:Job;
 constructor(chapterId:string,kind:Job['kind'],total:number,private notify:(job:Job)=>void){this.job={chapterId,kind,state:'running',done:0,total};this.emit()}
 emit(){this.notify({...this.job})}
 set(state:Job['state'],message?:string){if(this.job.state==='cancelled')return;this.job.state=state;this.job.message=message;if(state==='cancelled')this.abort.abort();this.emit()}
 async ready(){while(this.job.state==='paused')await new Promise(r=>setTimeout(r,200));if(this.job.state==='cancelled')throw new Error('任务已取消')}
 progress(done:number,total=this.job.total,message?:string){this.job.done=done;this.job.total=total;this.job.message=message;this.emit()}
}

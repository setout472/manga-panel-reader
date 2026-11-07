import {useState} from 'react';
import type {Settings as SettingsType,Provider,CloudProfile} from '../shared/types';
import {Icon} from './Icons';
export function Settings({settings,onSaved,onError}:{settings:SettingsType;onSaved:(s:SettingsType)=>void;onError:(e:unknown)=>void}){
 const [provider,setProvider]=useState<Provider>(settings.provider??'default');
 const [baseUrl,setBaseUrl]=useState(settings.baseUrl),[model,setModel]=useState(settings.model),[apiKey,setApiKey]=useState(''),[maxImageSide,setSide]=useState(settings.maxImageSide);
 const [wireApi,setWire]=useState<CloudProfile['wireApi']>(settings.wireApi??'chat-completions'),[effort,setEffort]=useState<CloudProfile['reasoningEffort']>(settings.reasoningEffort??'high');
 const [busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
 const profile=settings.profiles?.[provider];const hasKey=profile?.hasApiKey??settings.hasApiKey;
 const switchProvider=(next:Provider)=>{const p=settings.profiles?.[next];if(!p)return;setProvider(next);setBaseUrl(p.baseUrl);setModel(p.model);setSide(p.maxImageSide);setWire(p.wireApi);setEffort(p.reasoningEffort);setApiKey('');setSaved(false)};
 const submit=async()=>{setBusy(true);setSaved(false);try{const next=await window.reader.saveSettings({provider,baseUrl:baseUrl.trim(),model:model.trim(),maxImageSide,wireApi,reasoningEffort:effort,...(apiKey.trim()?{apiKey:apiKey.trim()}:{})});onSaved(next);setApiKey('');setSaved(true)}catch(e){onError(e)}finally{setBusy(false)}};
 return <section className="settings-page"><header className="section-head"><div><div className="eyebrow">MAKE IT YOURS</div><h1>阅读设置</h1><p>不同服务分别保存配置和密钥；保存后才切换，浏览设置不调用模型。</p></div></header>
 <div className="settings-card"><div className="card-title"><span className="feature-icon"><Icon name="spark"/></span><div><h2>云端模型接口</h2><p>当前已启用：{settings.provider==='relay'?'中转站':'原有服务 / DeepSeek'}；仅在手动开始分析时发送页面。</p></div><span className={`pill ${hasKey?'success':''}`}>{hasKey?'本配置密钥已保存':'本配置尚未配置密钥'}</span></div>
 <div className="form-grid">
 <label className="field full">服务配置<select value={provider} disabled={busy} onChange={e=>switchProvider(e.target.value as Provider)}><option value="default">原有服务 / DeepSeek</option><option value="relay">中转站 / GPT（fox）</option></select><small>两套 Key 独立加密保存，不复制或覆盖另一套。</small></label>
 <label className="field full">API 地址<input aria-label="API 地址" value={baseUrl} disabled={busy} onChange={e=>{setBaseUrl(e.target.value);setSaved(false)}} placeholder="https://your-provider.example/v1" spellCheck={false}/><small>填写基础地址，不加 /responses 或 /chat/completions。更换地址且未填写新 Key 时清除该配置旧 Key。</small></label>
 <label className="field full">API Key<input aria-label="API Key" type="password" autoComplete="new-password" disabled={busy} value={apiKey} onChange={e=>{setApiKey(e.target.value);setSaved(false)}} placeholder={hasKey?'已加密保存；同地址留空保持不变':'输入此服务提供的 API Key'} spellCheck={false}/><small>密钥只由主进程使用，已保存的 Key 不回传到界面。</small></label>
 <label className="field">接口协议<select value={wireApi} disabled={busy} onChange={e=>{setWire(e.target.value as CloudProfile['wireApi']);setSaved(false)}}><option value="chat-completions">Chat Completions</option><option value="responses">Responses</option></select></label>
 <label className="field">模型名称<input value={model} disabled={busy} onChange={e=>{setModel(e.target.value);setSaved(false)}} placeholder="支持图片输入的模型"/></label>
 {wireApi==='responses'&&<label className="field">推理强度<select value={effort} disabled={busy} onChange={e=>{setEffort(e.target.value as CloudProfile['reasoningEffort']);setSaved(false)}}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>}
 <label className="field">发送图片最长边<select disabled={busy} value={maxImageSide} onChange={e=>{setSide(Number(e.target.value));setSaved(false)}}>{[1024,1536,1600,2048,3072,4096].map(x=><option key={x} value={x}>{x} px</option>)}</select></label>
 </div><div className="settings-note">{wireApi==='responses'?'Responses 请求固定发送 store: false，不使用服务端对话链；服务商自身留存策略另行管理。':''} 原图保留在本地；手动云端分析会向此服务发送缩放图片并可能产生费用。图片输入及模型可用性仍需真实样本验证。</div>
 <div className="settings-actions">{saved&&<span className="saved"><Icon name="check"/>设置已保存</span>}<button className="primary" onClick={submit} disabled={busy||!baseUrl.trim()||!model.trim()}>{busy?'正在保存…':'保存设置'}</button></div></div>
 <div className="settings-card local-card"><Icon name="book"/><div><h3>本地资料库</h3><p className="data-path">{settings.dataDir}</p><small>漫画、分镜调整与阅读进度保存在此目录。</small></div></div></section>;
}

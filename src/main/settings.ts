import {safeStorage} from 'electron';
import {existsSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {atomicJson} from './library';
import type {Settings,Provider,SaveSettings,CloudProfile} from '../shared/types';
type StoredProfile={baseUrl:string;model:string;maxImageSide:number;encryptedKey?:string;wireApi:CloudProfile['wireApi'];reasoningEffort:CloudProfile['reasoningEffort']};
type Stored={version:2;provider:Provider;profiles:Record<Provider,StoredProfile>};
function defaults(provider:Provider):StoredProfile{return provider==='relay'?{baseUrl:'https://code1.newcli.com/v1',model:'gpt-6.1-sol',maxImageSide:2048,wireApi:'responses',reasoningEffort:'high'}:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',maxImageSide:1600,wireApi:'chat-completions',reasoningEffort:'high'}}
export class Preferences {
 private file:string;constructor(private root:string){this.file=join(root,'settings.json')}
 private read():Stored{
  if(!existsSync(this.file))return {version:2,provider:'default',profiles:{default:defaults('default'),relay:defaults('relay')}};
  try{const data=JSON.parse(readFileSync(this.file,'utf8'));if(data.version===2){if(!['default','relay'].includes(data.provider)||!data.profiles?.default||!data.profiles?.relay)throw Error();return data}
   return {version:2,provider:'default',profiles:{default:{...defaults('default'),baseUrl:data.baseUrl,model:data.model,maxImageSide:data.maxImageSide,encryptedKey:data.encryptedKey},relay:defaults('relay')}};
  }catch{throw Error('设置文件损坏，请恢复 settings.json.bak')}
 }
 key(){const s=this.read(),p=s.profiles[s.provider];if(!p.encryptedKey)return '';try{return safeStorage.decryptString(Buffer.from(p.encryptedKey,'base64'))}catch{throw Error('密钥解密失败，请重新填写 API Key')}}
 public():Settings{const s=this.read();const visible=(p:StoredProfile):CloudProfile=>({baseUrl:p.baseUrl,model:p.model,maxImageSide:p.maxImageSide,wireApi:p.wireApi,reasoningEffort:p.reasoningEffort,hasApiKey:!!p.encryptedKey});return {...visible(s.profiles[s.provider]),provider:s.provider,profiles:{default:visible(s.profiles.default),relay:visible(s.profiles.relay)},dataDir:this.root}}
 save(value:SaveSettings){
  const url=new URL(value.baseUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('模型接口应为不含凭据与参数的 HTTPS 地址');
  if(!value.model?.trim()||value.model.length>120)throw Error('请输入有效模型名称');if(!Number.isInteger(value.maxImageSide)||value.maxImageSide<512||value.maxImageSide>4096)throw Error('分析图片长边应为 512～4096');
  const s=this.read(),provider=value.provider??s.provider;if(!['default','relay'].includes(provider))throw Error('服务配置无效');const old=s.profiles[provider],wireApi=value.wireApi??old.wireApi,reasoningEffort=value.reasoningEffort??old.reasoningEffort;
  if(!['responses','chat-completions'].includes(wireApi)||!['low','medium','high'].includes(reasoningEffort))throw Error('接口协议或推理强度无效');
  const baseUrl=url.href.replace(/\/$/,'');const next:StoredProfile={...old,baseUrl,model:value.model.trim(),maxImageSide:value.maxImageSide,wireApi,reasoningEffort};
  if(baseUrl!==old.baseUrl.replace(/\/$/,''))delete next.encryptedKey;
  if(value.apiKey?.trim()){if(!safeStorage.isEncryptionAvailable())throw Error('系统凭据保护暂不可用，请稍后重试');next.encryptedKey=safeStorage.encryptString(value.apiKey.trim()).toString('base64')}
  s.provider=provider;s.profiles[provider]=next;atomicJson(this.file,s);return this.public();
 }
}

import 'server-only';
import { getAgentEnv } from './env';
import { requestActor } from './auth';
async function key(secret:string){return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function saveOutput(workspaceId:string,name:string,content:string):Promise<string>{
  const actor=await requestActor();if(!actor)throw new Error('Authentication required');const env=await getAgentEnv();
  if(actor.workspaceId&&actor.workspaceId!==workspaceId)throw new Error('Workspace access denied');
  const member=await env.DB.prepare("SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? AND role IN ('owner','admin','editor')").bind(workspaceId,actor.userId).first();if(!member)throw new Error('Workspace access denied');
  const path=`${workspaceId}/${crypto.randomUUID()}-${name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  await env.OUTPUTS.put(path,content,{httpMetadata:{contentType:'text/plain; charset=utf-8'}});
  const expires=Math.floor(Date.now()/1000)+3600;const signature=await crypto.subtle.sign('HMAC',await key(env.BETTER_AUTH_SECRET),new TextEncoder().encode(`file-download:v1:${expires}:${path}`));const token=Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
  return `${env.BETTER_AUTH_URL}/api/outputs/${path}?expires=${expires}&signature=${token}`;
}
export async function readOutput(request:Request,path:string):Promise<Response>{
  const url=new URL(request.url);const expires=url.searchParams.get('expires')??'';const signature=url.searchParams.get('signature')??'';
  if(!/^\d+$/.test(expires)||! /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/.test(path)||path.includes('..')||! /^[a-f0-9]{64}$/.test(signature))return new Response('Not found',{status:404});
  const remaining=Number(expires)-Math.floor(Date.now()/1000);if(remaining<0||remaining>3600)return new Response('Expired',{status:403});
  const env=await getAgentEnv();const bytes=new Uint8Array(signature.match(/../g)!.map(x=>parseInt(x,16)));const valid=await crypto.subtle.verify('HMAC',await key(env.BETTER_AUTH_SECRET),bytes,new TextEncoder().encode(`file-download:v1:${expires}:${path}`));if(!valid)return new Response('Not found',{status:404});
  const file=await env.OUTPUTS.get(path);if(!file)return new Response('Not found',{status:404});return new Response(file.body as unknown as BodyInit,{headers:{'content-type':'text/plain; charset=utf-8','content-disposition':'attachment','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}

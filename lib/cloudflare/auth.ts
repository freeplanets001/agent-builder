import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { headers } from 'next/headers';
import { cache } from 'react';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as schema from './auth-schema';
import { getAgentEnv } from './env';

export async function getAuth() {
  const env = await getAgentEnv();
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) throw new Error('Authentication is not configured');
  return betterAuth({
    baseURL:env.BETTER_AUTH_URL,secret:env.BETTER_AUTH_SECRET,
    database:drizzleAdapter(drizzle(env.DB,{schema}),{provider:'sqlite',schema}),
    socialProviders:env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET ? {github:{clientId:env.GITHUB_CLIENT_ID,clientSecret:env.GITHUB_CLIENT_SECRET,disableSignUp:true}} : {},
    account:{accountLinking:{enabled:false}},
    session:{expiresIn:60*60*24*7,updateAge:60*60*24,cookieCache:{enabled:false}},
    advanced:{cookiePrefix:'agent-builder',database:{generateId:()=>crypto.randomUUID()}},
    rateLimit:{enabled:true,storage:'database',window:60,max:20},
  });
}
export interface Actor { userId:string; workspaceId?:string; method:'cookie'|'api_key'; }

const scopedActor=new AsyncLocalStorage<Actor>();
export function runWithActor<T>(actor:Actor,callback:()=>Promise<T>):Promise<T>{return scopedActor.run(actor,callback);}
export function requestActor():Promise<Actor|null>{return scopedActor.getStore()?Promise.resolve(scopedActor.getStore()!):resolveRequestActor();}
const resolveRequestActor=cache(async ():Promise<Actor|null>=>{
  const h=await headers();const bearer=h.get('authorization');const env=await getAgentEnv();
  if (bearer) {
    if(!bearer.startsWith('Bearer '))return null;
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(bearer.slice(7).trim()));
    const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
    const row=await env.DB.prepare('SELECT k.id,k.created_by,k.workspace_id FROM api_keys k JOIN workspace_members m ON m.workspace_id=k.workspace_id AND m.user_id=k.created_by WHERE k.key_hash=? AND k.is_active=1 AND (k.expires_at IS NULL OR k.expires_at>?)').bind(hash,new Date().toISOString()).first<{id:string;created_by:string;workspace_id:string}>();
    if(!row)return null;
    await env.DB.prepare('UPDATE api_keys SET last_used_at=? WHERE id=?').bind(new Date().toISOString(),row.id).run();
    return {userId:row.created_by,workspaceId:row.workspace_id,method:'api_key'};
  }
  const auth=await getAuth();const session=await auth.api.getSession({headers:h});
  return session?.user ? {userId:session.user.id,method:'cookie'} : null;
});

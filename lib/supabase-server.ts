/** Query compatibility client. All database requests execute locally against D1. */
import 'server-only';
import { AuthError, createClient as queryClient, type User } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { getAgentEnv } from './cloudflare/env';
import { requestActor } from './cloudflare/auth';
import { databaseFetch } from './cloudflare/database';
export function createServiceRoleClient() {
  // This legacy name grants no administrative bypass.
  const client=queryClient('https://d1.internal','cloudflare-query-client',{
    global:{fetch:async(input,init)=>databaseFetch((await getAgentEnv()).DB,await requestActor(),input,init)},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
  client.auth.getUser=async()=>{
    const actor=await requestActor();const env=await getAgentEnv();
    if(!actor)return {data:{user:null},error:new AuthError('Authentication required')};
    const method=(await headers()).get('x-agent-request-method')??'GET';
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      const scope=actor.workspaceId?' AND workspace_id=?':'';
      const allowed=await env.DB.prepare(`SELECT 1 AS ok FROM workspace_members WHERE user_id=? AND role IN ('owner','admin','editor')${scope} LIMIT 1`).bind(actor.userId,...(actor.workspaceId?[actor.workspaceId]:[])).first();
      if(!allowed)return {data:{user:null},error:new AuthError('Write permission required')};
    }
    const profile=await env.DB.prepare('SELECT email,full_name,avatar_url,created_at FROM profiles WHERE id=?').bind(actor.userId).first<{email:string;full_name:string|null;avatar_url:string|null;created_at:string}>();
    if(!profile)return {data:{user:null},error:new AuthError('Profile missing')};
    const user:User={id:actor.userId,email:profile.email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'github'},user_metadata:{full_name:profile.full_name,avatar_url:profile.avatar_url},created_at:profile.created_at};
    return {data:{user},error:null};
  };
  return client;
}
export async function createClient(){return createServiceRoleClient();}

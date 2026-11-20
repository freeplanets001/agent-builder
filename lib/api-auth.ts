import 'server-only';
import { NextRequest } from 'next/server';
import { createServiceRoleClient } from './supabase-server';
import { requestActor } from './cloudflare/auth';
export interface AuthResult {authenticated:boolean;userId:string|null;workspaceId:string|null;method:'cookie'|'api_key'|'none';error:string|null;supabase:ReturnType<typeof createServiceRoleClient>|null;}
export async function authenticateRequest(_request:NextRequest):Promise<AuthResult>{
  const actor=await requestActor();
  if(!actor)return {authenticated:false,userId:null,workspaceId:null,method:'none',error:'認証が必要です',supabase:null};
  const client=createServiceRoleClient();const {data:{user},error}=await client.auth.getUser();
  if(!user||error)return {authenticated:false,userId:null,workspaceId:null,method:actor.method,error:'権限がありません',supabase:null};
  return {authenticated:true,userId:actor.userId,workspaceId:actor.workspaceId??null,method:actor.method,error:null,supabase:client};
}

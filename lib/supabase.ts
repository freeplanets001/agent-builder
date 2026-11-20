'use client';
import { authClient } from './auth-client';
export function createClient(){
  return {auth:{signOut:()=>authClient.signOut(),signInWithOAuth:async(_options:{provider:'github';options:{redirectTo:string}})=>{
    const result=await authClient.signIn.social({provider:'github',callbackURL:'/agents'});return {error:result.error};
  }}};
}

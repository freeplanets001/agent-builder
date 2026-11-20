import metadata from './schema-metadata.json';
import type { Actor } from './auth';

export type Bind = string|number|null;
export interface Fragment {sql:string;values:Bind[];}
export type Row=Record<string,unknown>;
export const tables:Record<string,Record<string,{type:string}>>=metadata;
export function identifier(name:string):string {
  if(!/^[a-z_][a-z0-9_]*$/i.test(name))throw new Error('Unsupported identifier');
  return `"${name}"`;
}
export function column(table:string,name:string,alias='r'):string {
  if(!tables[table]?.[name])throw new Error('Unsupported column');
  return `${identifier(alias)}.${identifier(name)}`;
}
const parents:Record<string,[string,string]>={
  agent_tools:['agents','agent_id'],agent_variables:['agents','agent_id'],agent_versions:['agents','agent_id'],agent_guardrails:['agents','agent_id'],
  flow_nodes:['flows','flow_id'],flow_edges:['flows','flow_id'],messages:['conversations','conversation_id'],conversation_messages:['agent_conversations','conversation_id'],
  knowledge_documents:['knowledge_bases','knowledge_base_id'],knowledge_chunks:['knowledge_bases','knowledge_base_id'],
  skill_versions:['skills','skill_id'],eval_cases:['eval_suites','suite_id'],agent_test_results:['agent_test_runs','run_id'],webhook_tokens:['automations','automation_id'],
  marketplace_reviews:['marketplace_listings','listing_id'],
};

export function accessPolicy(table:string,actor:Actor,write=false,alias='r',depth=0):Fragment {
  if(!tables[table]||depth>4)throw new Error('Unsupported table');
  const col=(name:string)=>column(table,name,alias);
  if(table==='profiles')return {sql:`${col('id')}=?`,values:[actor.userId]};
  if(table==='workspaces') {
    const roles=write?"AND m.role IN ('owner','admin')":'';
    const scope=actor.workspaceId?` AND ${col('id')}=?`:'';
    return {sql:`(${col('owner_id')}=? OR ${col('id')} IN (SELECT m.workspace_id FROM workspace_members m WHERE m.user_id=? ${roles}))${scope}`,values:[actor.userId,actor.userId,...(actor.workspaceId?[actor.workspaceId]:[])]};
  }
  if(table==='workspace_members') {
    const roles=write?"AND m.role IN ('owner','admin')":'';
    const scope=actor.workspaceId?` AND ${col('workspace_id')}=?`:'';
    return {sql:`(${col('workspace_id')} IN (SELECT m.workspace_id FROM workspace_members m WHERE m.user_id=? ${roles}) OR ${col('workspace_id')} IN (SELECT w.id FROM workspaces w WHERE w.owner_id=?))${scope}`,values:[actor.userId,actor.userId,...(actor.workspaceId?[actor.workspaceId]:[])]};
  }
  if(tables[table].workspace_id) {
    const adminOnly=['provider_api_keys','api_keys','workspace_cost_limits','integrations'].includes(table);
    const roles=write?adminOnly?" AND m.role IN ('owner','admin')":" AND m.role IN ('owner','admin','editor')":'';
    const scoped=actor.workspaceId?` AND ${col('workspace_id')}=?`:'';
    let sql=`(${col('workspace_id')} IN (SELECT m.workspace_id FROM workspace_members m WHERE m.user_id=?${roles})${scoped})`;
    const values:Bind[]=[actor.userId,...(actor.workspaceId?[actor.workspaceId]:[])];
    if(!write && table==='image_prompt_templates')sql=`(${sql} OR ${col('is_public')}=1)`;
    if(!write && table==='marketplace_listings')sql=`(${sql} OR ${col('status')}='published')`;
    if(!write && table==='agents'&&!actor.workspaceId)sql=`(${sql} OR ${col('visibility')}='public')`;
    if(table==='agent_conversations') {sql+=` AND ${col('user_id')}=?`;values.push(actor.userId);}
    return {sql,values};
  }
  if(table==='conversations')return {sql:`${col('user_id')}=? AND EXISTS (SELECT 1 FROM agents p WHERE p.id=${col('agent_id')} AND ${accessPolicy('agents',actor,write,'p',depth+1).sql})`,values:[actor.userId,...accessPolicy('agents',actor,write,'p',depth+1).values]};
  const parent=parents[table];
  if(parent){const p=accessPolicy(parent[0],actor,write,`p${depth}`,depth+1);const privateChildren=parent[0]==='agents'?` AND ${identifier(`p${depth}`)}.workspace_id IN (SELECT private_member.workspace_id FROM workspace_members private_member WHERE private_member.user_id=?)`:'';return {sql:`EXISTS (SELECT 1 FROM ${identifier(parent[0])} ${identifier(`p${depth}`)} WHERE ${identifier(`p${depth}`)}.id=${col(parent[1])} AND (${p.sql})${privateChildren})`,values:[...p.values,...(privateChildren?[actor.userId]:[])]};}
  throw new Error('No authorization policy for table');
}

export function splitTop(text:string):string[] {
  const parts:string[]=[];let depth=0;let quote=false;let start=0;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"')quote=!quote;else if(!quote){if(c==='('||c==='{')depth++;if(c===')'||c==='}')depth--;if(c===','&&depth===0){parts.push(text.slice(start,i).trim());start=i+1;}}}
  if(depth!==0||quote)throw new Error('Malformed expression');parts.push(text.slice(start).trim());return parts.filter(Boolean);
}
export function filter(table:string,name:string,value:string,alias='r'):Fragment {
  const col=column(table,name,alias);const dot=value.indexOf('.');if(dot<0)throw new Error('Unsupported filter');
  const op=value.slice(0,dot);const argument=value.slice(dot+1);
  const scalar:Bind=tables[table][name].type==='boolean'?(argument==='true'?1:argument==='false'?0:argument):argument;
  const operators:Record<string,string>={eq:'=',neq:'!=',gt:'>',gte:'>=',lt:'<',lte:'<=',like:'LIKE',ilike:'LIKE'};
  if(operators[op])return {sql:`${col} ${operators[op]} ?${op==='ilike'?' COLLATE NOCASE':''}`,values:[scalar]};
  if(op==='is'&&['null','true','false'].includes(argument))return {sql:`${col} IS ${argument==='null'?'NULL':argument==='true'?'1':'0'}`,values:[]};
  if(op==='in'&&argument.startsWith('(')&&argument.endsWith(')')){const entries=splitTop(argument.slice(1,-1)).map(v=>v.replace(/^"|"$/g,''));return {sql:entries.length?`${col} IN (${entries.map(()=>'?').join(',')})`:'0',values:entries};}
  if((op==='cs'||op==='ov')&&argument.startsWith('{')&&argument.endsWith('}')){const entries=splitTop(argument.slice(1,-1)).map(v=>v.replace(/^"|"$/g,''));if(!entries.length)return {sql:op==='cs'?'1':'0',values:[]};return {sql:'('+entries.map(()=>`EXISTS (SELECT 1 FROM json_each(${col}) j WHERE j.value=?)`).join(op==='cs'?' AND ':' OR ')+')',values:entries};}
  throw new Error('Unsupported filter operator');
}
export function readFilters(table:string,params:URLSearchParams):Fragment {
  const parts:Fragment[]=[];
  for(const [name,value] of params){
    if(['select','order','limit','offset','on_conflict','columns'].includes(name))continue;
    if(name==='or') {
      if(!value.startsWith('(')||!value.endsWith(')'))throw new Error('Malformed OR');
      const sub=splitTop(value.slice(1,-1)).map(v=>{const d=v.indexOf('.');if(d<0)throw new Error('Malformed OR');return filter(table,v.slice(0,d),v.slice(d+1));});
      parts.push({sql:'('+sub.map(x=>x.sql).join(' OR ')+')',values:sub.flatMap(x=>x.values)});
    }else parts.push(filter(table,name,value));
  }
  return {sql:parts.length?parts.map(x=>`(${x.sql})`).join(' AND '):'1',values:parts.flatMap(x=>x.values)};
}

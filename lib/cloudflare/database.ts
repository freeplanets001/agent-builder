import 'server-only';
import type { D1Database } from '@cloudflare/workers-types';
import type { Actor } from './auth';
import { accessPolicy, column, filter, identifier, readFilters, splitTop, tables, type Bind, type Fragment, type Row } from './policy';

type Relation={table:string;local:string;remote:string;many:boolean};
const relations:Record<string,Record<string,Relation>>={
  agents:{agent_tools:{table:'agent_tools',local:'id',remote:'agent_id',many:true},agent_variables:{table:'agent_variables',local:'id',remote:'agent_id',many:true}},
  execution_logs:{agents:{table:'agents',local:'agent_id',remote:'id',many:false}},
  automations:{agents:{table:'agents',local:'agent_id',remote:'id',many:false},webhook_tokens:{table:'webhook_tokens',local:'id',remote:'automation_id',many:true}},
  flows:{flow_nodes:{table:'flow_nodes',local:'id',remote:'flow_id',many:true},flow_edges:{table:'flow_edges',local:'id',remote:'flow_id',many:true}},
  knowledge_bases:{knowledge_documents:{table:'knowledge_documents',local:'id',remote:'knowledge_base_id',many:true},knowledge_chunks:{table:'knowledge_chunks',local:'id',remote:'knowledge_base_id',many:true}},
  eval_suites:{eval_cases:{table:'eval_cases',local:'id',remote:'suite_id',many:true}},
};
const references:Record<string,string>={agent_id:'agents',workspace_id:'workspaces',flow_id:'flows',knowledge_base_id:'knowledge_bases',document_id:'knowledge_documents',skill_id:'skills',suite_id:'eval_suites',automation_id:'automations',pipeline_id:'agent_pipelines',listing_id:'marketplace_listings',source_node_id:'flow_nodes',target_node_id:'flow_nodes'};

function binding(table:string,name:string,value:unknown):Bind {
  if(!tables[table]?.[name])throw new Error('Unsupported column');
  if(value===null)return null;
  if(tables[table][name].type==='json')return name==='embedding'&&typeof value==='string'?JSON.stringify(JSON.parse(value)):JSON.stringify(value);
  if(typeof value==='boolean')return value?1:0;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(typeof value==='string')return value;
  throw new Error('Unsupported value');
}
function decoded(table:string,row:Row):Row {
  const output:Row={...row};
  for(const [name,spec] of Object.entries(tables[table])){
    const value=output[name];
    if(value!==null&&value!==undefined){if(spec.type==='boolean')output[name]=Boolean(value);else if(spec.type==='json'&&typeof value==='string')output[name]=JSON.parse(value);}
  }
  return output;
}
function numericParam(value:string|null,fallback:number,max:number):number{
  if(value===null)return fallback;if(!/^\d+$/.test(value))throw new Error('Invalid pagination');return Math.min(max,Number(value));
}
function orders(table:string,value:string|null):string {
  if(!value)return '';
  return ' ORDER BY '+splitTop(value).map(item=>{const [name,direction='asc',nulls,...extra]=item.split('.');if(extra.length||!['asc','desc'].includes(direction)||nulls&&!['nullsfirst','nullslast'].includes(nulls))throw new Error('Unsupported order');return column(table,name)+' '+direction.toUpperCase()+(nulls==='nullsfirst'?' NULLS FIRST':nulls==='nullslast'?' NULLS LAST':'');}).join(',');
}
async function rows(db:D1Database,table:string,actor:Actor,params:URLSearchParams):Promise<{data:Row[];count:number}> {
  const policy=accessPolicy(table,actor);const filters=readFilters(table,params);const where=`(${policy.sql}) AND (${filters.sql})`;const values=[...policy.values,...filters.values];
  const count=await db.prepare(`SELECT COUNT(*) AS total FROM ${identifier(table)} r WHERE ${where}`).bind(...values).first<{total:number}>();
  const query=`SELECT r.* FROM ${identifier(table)} r WHERE ${where}${orders(table,params.get('order'))} LIMIT ? OFFSET ?`;
  const result=await db.prepare(query).bind(...values,numericParam(params.get('limit'),1000,10000),numericParam(params.get('offset'),0,1000000)).all<Row>();
  const selected=await project(db,table,actor,result.results.map(r=>decoded(table,r)),params.get('select')??'*');
  return {data:selected,count:count?.total??0};
}
async function project(db:D1Database,table:string,actor:Actor,input:Row[],selection:string,depth=0):Promise<Row[]> {
  if(depth>2)throw new Error('Join depth exceeded');
  const fields=splitTop(selection);const output:Row[]=[];
  for(const row of input){
    const next:Row={};let include=true;
    for(const field of fields){
      if(field==='*'){Object.assign(next,row);continue;}
      const relation=/^([a-z_]+)(!inner)?\(([\s\S]*)\)$/.exec(field);
      if(relation){
        const [,name,inner,sub]=relation;const spec=relations[table]?.[name];if(!spec)throw new Error('Unsupported join');
        const policy=accessPolicy(spec.table,actor);
        if(sub==='count'){
          const counted=await db.prepare(`SELECT COUNT(*) AS total FROM ${identifier(spec.table)} r WHERE ${column(spec.table,spec.remote)}=? AND ${policy.sql}`).bind(binding(table,spec.local,row[spec.local]),...policy.values).first<{total:number}>();
          if(inner&&!counted?.total){include=false;break;}next[name]=[{count:counted?.total??0}];continue;
        }
        const result=await db.prepare(`SELECT r.* FROM ${identifier(spec.table)} r WHERE ${column(spec.table,spec.remote)}=? AND ${policy.sql} LIMIT 10000`).bind(binding(table,spec.local,row[spec.local]),...policy.values).all<Row>();
        const related=result.results.map(r=>decoded(spec.table,r));if(inner&&!related.length){include=false;break;}
        next[name]=spec.many?await project(db,spec.table,actor,related,sub,depth+1):(await project(db,spec.table,actor,related,sub,depth+1))[0]??null;
      } else {column(table,field);next[field]=row[field];}
    }
    if(include)output.push(next);
  }
  return output;
}
function record(input:unknown):Row {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid payload');return input as Row;
}
function insertPolicy(table:string,actor:Actor,row:Row):Fragment {
  const policy=accessPolicy(table,actor,true,'r');const parts=[policy.sql];const values=[...policy.values];
  if(table==='workspaces'){
    if(actor.workspaceId)throw new Error('API keys cannot create workspaces');
    return {sql:'r.owner_id=?',values:[actor.userId]};
  }
  if(table==='profiles'&&row.id!==actor.userId)throw new Error('Profile access denied');
  for(const identity of ['created_by','user_id','owner_id'])if(row[identity]!==undefined&&row[identity]!==null&&row[identity]!==actor.userId)throw new Error('Identity mismatch');
  if(table==='workspace_members') {
    if(!['owner','admin','editor','viewer'].includes(String(row.role)))throw new Error('Invalid role');
    if(row.role==='owner'){parts.push('EXISTS (SELECT 1 FROM workspaces w WHERE w.id=r.workspace_id AND w.owner_id=?)');values.push(actor.userId);}
  }
  for(const [name,target] of Object.entries(references)){
    if(row[name]===null||row[name]===undefined||name==='workspace_id')continue;
    const p=accessPolicy(target,actor,false,'f');let check=`EXISTS (SELECT 1 FROM ${identifier(target)} f WHERE f.id=r.${identifier(name)} AND ${p.sql}`;
    if(row.workspace_id && tables[target].workspace_id)check+=' AND f.workspace_id=r.workspace_id';
    check+=')';parts.push(check);values.push(...p.values);
  }
  return {sql:parts.map(p=>`(${p})`).join(' AND '),values};
}
export async function databaseFetch(db:D1Database,actor:Actor|null,input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
  try{
    if(!actor)return Response.json({message:'Authentication required',code:'42501'},{status:401});
    const request=new Request(input,init);const url=new URL(request.url);
    const rpc=/^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
    if(rpc&&request.method==='POST')return await rpcResponse(db,actor,rpc[1],record(await request.json()));
    const match=/^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    if(!match||!tables[match[1]])throw new Error('Unsupported database operation');
    const table=match[1];const prefer=request.headers.get('prefer')??'';const one=request.headers.get('accept')?.includes('vnd.pgrst.object');
    let data:Row[]=[];let count=0;
    if(request.method==='GET'||request.method==='HEAD'){
      const range=request.headers.get('range');if(range){const m=/^(\d+)-(\d+)$/.exec(range);if(!m)throw new Error('Invalid range');url.searchParams.set('offset',m[1]);url.searchParams.set('limit',String(Number(m[2])-Number(m[1])+1));}
      const result=await rows(db,table,actor,url.searchParams);data=result.data;count=result.count;
    }else if(request.method==='POST'){
      const body:unknown=await request.json();const inputs=Array.isArray(body)?body:[body];if(inputs.length>1000)throw new Error('Batch too large');
      const statements=[];
      for(const raw of inputs){
        const item={...record(raw)};if(tables[table].id&&!item.id)item.id=crypto.randomUUID();
        for(const identity of ['created_by','user_id','owner_id'])if(tables[table][identity]&&item[identity]===undefined)item[identity]=actor.userId;
        const names=Object.keys(item);for(const name of names)column(table,name);
        const cols=names.map(identifier);const policy=insertPolicy(table,actor,item);
        const conflict=url.searchParams.get('on_conflict')??'id';const conflictColumns=conflict.split(',');for(const name of conflictColumns)column(table,name);
        const upsert=prefer.includes('resolution=merge-duplicates');
        const existing=accessPolicy(table,actor,true,table);
        const mutable=names.filter(n=>!['id','workspace_id','user_id','created_by','owner_id'].includes(n));
        const onConflict=upsert?` ON CONFLICT (${conflictColumns.map(identifier).join(',')}) DO UPDATE SET ${mutable.map(n=>`${identifier(n)}=excluded.${identifier(n)}`).join(',')} WHERE CASE WHEN (${existing.sql}) THEN 1 ELSE json('authorization denied') END`:'';
        statements.push(db.prepare(`WITH r AS (SELECT ${names.map(n=>`? AS ${identifier(n)}`).join(',')}) INSERT INTO ${identifier(table)} (${cols.join(',')}) SELECT ${cols.join(',')} FROM r WHERE CASE WHEN (${policy.sql}) THEN 1 ELSE json('authorization denied') END${onConflict} RETURNING *`).bind(...names.map(n=>binding(table,n,item[n])),...policy.values,...(upsert?existing.values:[])));
      }
      const results=await db.batch<Row>(statements);data=results.flatMap(r=>r.results.map(row=>decoded(table,row)));if(data.length!==inputs.length)throw new Error('Write access denied');count=data.length;
    }else if(request.method==='PATCH'||request.method==='DELETE'){
      const policy=accessPolicy(table,actor,true);const filters=readFilters(table,url.searchParams);if(filters.sql==='1')throw new Error('Unfiltered mutation denied');
      const values:Bind[]=[];let sql='';
      if(request.method==='PATCH'){
        const item=record(await request.json());const names=Object.keys(item);if(!names.length)throw new Error('Empty update');
        const mutableReferences:Record<string,string[]>={knowledge_bases:['agent_id'],automations:['agent_id'],integrations:['agent_id'],flow_nodes:['agent_id']};
        const referenceChecks:Fragment[]=[];
        for(const name of names){
          column(table,name);
          const mutable=mutableReferences[table]?.includes(name);
          if(name==='id'||name.endsWith('_id')&&!mutable||['created_by','owner_id','role'].includes(name))throw new Error('Immutable relation');
          if(mutable&&item[name]!==null){const target=references[name];const p=accessPolicy(target,actor,false,'f');const scope=tables[table].workspace_id?' AND f.workspace_id=r.workspace_id':` AND f.workspace_id=(SELECT n.workspace_id FROM flows n WHERE n.id=r.flow_id)`;referenceChecks.push({sql:`EXISTS (SELECT 1 FROM ${identifier(target)} f WHERE f.id=? AND (${p.sql})${scope})`,values:[binding(table,name,item[name]),...p.values]});}
        }
        if(tables[table].updated_at)item.updated_at=new Date().toISOString();const keys=Object.keys(item);sql=`UPDATE ${identifier(table)} AS r SET ${keys.map(n=>`${identifier(n)}=?`).join(',')} WHERE (${policy.sql}) AND (${filters.sql})${referenceChecks.map(x=>` AND (${x.sql})`).join('')} RETURNING *`;values.push(...keys.map(n=>binding(table,n,item[n])));
        const result=await db.prepare(sql).bind(...values,...policy.values,...filters.values,...referenceChecks.flatMap(x=>x.values)).all<Row>();data=result.results.map(row=>decoded(table,row));count=data.length;
      }else sql=`DELETE FROM ${identifier(table)} AS r WHERE (${policy.sql}) AND (${filters.sql}) RETURNING *`;
      if(request.method==='DELETE'){const result=await db.prepare(sql).bind(...values,...policy.values,...filters.values).all<Row>();data=result.results.map(row=>decoded(table,row));count=data.length;}
    }else throw new Error('Unsupported method');
    if(url.searchParams.has('select')&&!['GET','HEAD'].includes(request.method))data=await project(db,table,actor,data,url.searchParams.get('select')??'*');
    if(one&&data.length!==1)return Response.json({message:'Expected one row',code:'PGRST116',details:`${data.length} rows`},{status:406});
    const responseHeaders={'content-type':'application/json','content-range':`0-${Math.max(0,data.length-1)}/${count}`};
    if(request.method==='HEAD')return new Response(null,{headers:responseHeaders});
    if(['POST','PATCH','DELETE'].includes(request.method)&&!prefer.includes('return=representation'))return new Response(null,{status:204,headers:responseHeaders});
    return Response.json(one?data[0]:data,{headers:responseHeaders});
  }catch(error){
    const known=error instanceof Error&&/^(Unsupported|Invalid|Malformed|No authorization|Unfiltered|Immutable|Identity|Write access|Profile access|Batch|Empty|API keys)/.test(error.message);
    return Response.json({message:known&&error instanceof Error?error.message:'Database operation failed',code:'42501'},{status:400});
  }
}

function vector(input:unknown):number[]{
  const value:unknown=typeof input==='string'?JSON.parse(input):input;
  if(!Array.isArray(value)||value.length<1||value.length>4096||!value.every(x=>typeof x==='number'&&Number.isFinite(x)))throw new Error('Invalid embedding');return value as number[];
}
function cosine(a:number[],b:number[]):number{
  if(a.length!==b.length)return -1;let ab=0,aa=0,bb=0;for(let i=0;i<a.length;i++){ab+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?ab/Math.sqrt(aa*bb):-1;
}
async function rpcResponse(db:D1Database,actor:Actor,name:string,body:Row):Promise<Response>{
  if(name==='update_kb_stats'){
    if(typeof body.kb_id!=='string'||Object.keys(body).length!==1)throw new Error('Invalid RPC input');const p=accessPolicy('knowledge_bases',actor,true,'r');
    await db.prepare(`UPDATE knowledge_bases AS r SET document_count=(SELECT count(*) FROM knowledge_documents d WHERE d.knowledge_base_id=r.id),chunk_count=(SELECT count(*) FROM knowledge_chunks c WHERE c.knowledge_base_id=r.id),total_tokens=coalesce((SELECT sum(c.token_count) FROM knowledge_chunks c WHERE c.knowledge_base_id=r.id),0) WHERE r.id=? AND ${p.sql}`).bind(body.kb_id,...p.values).run();return Response.json(null);
  }
  if(!['search_knowledge','search_agent_memories'].includes(name))throw new Error('Unsupported RPC');
  const allowed=['p_query_embedding','p_match_count','p_match_threshold',...(name==='search_knowledge'?['p_knowledge_base_id']:['p_agent_id','p_user_id'])];if(Object.keys(body).some(k=>!allowed.includes(k)))throw new Error('Unsupported RPC parameter');
  const query=vector(body.p_query_embedding);const table=name==='search_knowledge'?'knowledge_chunks':'agent_memories';const p=accessPolicy(table,actor);
  let sql=`SELECT r.* FROM ${table} r WHERE ${p.sql}`;const values:Bind[]=[...p.values];
  if(name==='search_knowledge'){
    if(typeof body.p_knowledge_base_id!=='string')throw new Error('Invalid knowledge base');sql+=' AND r.knowledge_base_id=?';values.push(body.p_knowledge_base_id);
  }else{
    if(typeof body.p_agent_id!=='string'||body.p_user_id!==actor.userId)throw new Error('Invalid memory scope');sql+=' AND r.agent_id=? AND r.user_id=? AND (r.expires_at IS NULL OR r.expires_at>?)';values.push(body.p_agent_id,actor.userId,new Date().toISOString());
  }
  const count=body.p_match_count??5;const threshold=body.p_match_threshold??0.3;if(typeof count!=='number'||count<1||count>100||typeof threshold!=='number'||threshold<0||threshold>1)throw new Error('Invalid search settings');
  const result=await db.prepare(sql+' LIMIT 10000').bind(...values).all<Row>();
  const ranked:Row[]=[];
  for(const row of result.results){if(!row.embedding)continue;const similarity=cosine(query,vector(row.embedding));if(similarity<threshold)continue;const {embedding:_,...safe}=row;ranked.push({...safe,similarity});}
  ranked.sort((a,b)=>Number(b.similarity)-Number(a.similarity));const selected=ranked.slice(0,count);
  if(name==='search_knowledge')for(const row of selected){const doc=await db.prepare('SELECT title FROM knowledge_documents WHERE id=?').bind(String(row.document_id)).first<{title:string}>();row.document_title=doc?.title??'';}
  return Response.json(selected);
}

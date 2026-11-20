// Local fixtures only. Executes the real adapter SQL against SQLite, with D1 batch rollback semantics.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const metadata = JSON.parse(read('lib/cloudflare/schema-metadata.json'));
const asModule = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const policyUrl = asModule(read('lib/cloudflare/policy.ts').replace("import metadata from './schema-metadata.json';", `const metadata = ${JSON.stringify(metadata)};`));
const databaseUrl = asModule(read('lib/cloudflare/database.ts').replace("import 'server-only';", '').replace("from './policy'", `from '${policyUrl}'`));
const { databaseFetch } = await import(databaseUrl);
const { accessPolicy, readFilters } = await import(policyUrl);

class Statement {
  constructor(sqlite, sql, values = []) { this.sqlite = sqlite; this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.sqlite, this.sql, values); }
  async all() {
    const results = this.sqlite.prepare(this.sql).all(...this.values).map(row => ({ ...row }));
    return { results, success: true, meta: { changes: this.sqlite.prepare('SELECT changes() n').get().n } };
  }
  async first(column) { const row = (await this.all()).results[0] ?? null; return column ? row?.[column] ?? null : row; }
  async run() { return this.all(); }
}
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(read('migrations/0001-app-schema.sql'));
  const put = (table, row) => {
    const columns = Object.keys(row);
    sqlite.prepare(`INSERT INTO "${table}" (${columns.map(c => '"' + c + '"').join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(row));
  };
  for (const id of ['owner-a', 'owner-b', 'editor-a', 'viewer-a']) put('profiles', { id, email: `${id}@example.invalid` });
  for (const name of ['a', 'b']) {
    put('workspaces', { id: name, owner_id: `owner-${name}`, name, slug: name });
    put('workspace_members', { id: `m-${name}`, workspace_id: name, user_id: `owner-${name}`, role: 'owner' });
    put('agents', { id: `agent-${name}`, workspace_id: name, created_by: `owner-${name}`, name: `Agent ${name}`, system_prompt: 'Fixture only', tags: '["tag"]' });
  }
  put('workspace_members', { id: 'm-editor', workspace_id: 'a', user_id: 'editor-a', role: 'editor' });
  put('workspace_members', { id: 'm-viewer', workspace_id: 'a', user_id: 'viewer-a', role: 'viewer' });
  const db = {
    prepare: sql => new Statement(sqlite, sql),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.all()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const actor = (userId = 'owner-a', workspaceId) => ({ userId, method: workspaceId ? 'api_key' : 'cookie', ...(workspaceId ? { workspaceId } : {}) });
  async function request(table, { user = actor(), method = 'GET', query = {}, body, prefer = 'return=representation' } = {}) {
    const url = new URL(`https://d1.internal/rest/v1/${table}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = await databaseFetch(db, user, url, { method, headers: { 'content-type': 'application/json', prefer }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  }
  const sdk = createClient('https://d1.internal', 'local-fixture-only', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => databaseFetch(db, actor(), input, init) },
  });
  return { sqlite, put, actor, request, sdk };
}
let passed = 0;
let failed = 0;
async function check(name, run) {
  const f = fixture();
  try { await run(f); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`); }
  finally { f.sqlite.close(); }
}
await check('tenant reads stay inside membership', async f => {
  const result = await f.request('agents'); assert.equal(result.status, 200); assert.deepEqual(result.data.map(r => r.id), ['agent-a']);
});
await check('API key workspace scope cannot select another membership', async f => {
  f.put('workspace_members', { id: 'm-a-b', user_id: 'owner-a', workspace_id: 'b', role: 'admin' });
  const result = await f.request('agents', { user: f.actor('owner-a', 'a') }); assert.deepEqual(result.data.map(r => r.id), ['agent-a']);
});
await check('viewer write denied', async f => {
  const result = await f.request('agents', { user: f.actor('viewer-a'), method: 'PATCH', query: { id: 'eq.agent-a' }, body: { name: 'changed' } });
  assert.equal(result.data?.length ?? 0, 0); assert.equal(f.sqlite.prepare('SELECT name FROM agents WHERE id=?').get('agent-a').name, 'Agent a');
});
await check('cross-tenant insert rejected without side effects', async f => {
  const result = await f.request('agents', { method: 'POST', body: { id: 'denied', workspace_id: 'b', created_by: 'owner-a', name: 'denied', system_prompt: '' } });
  assert.equal(result.status, 400); assert.equal(f.sqlite.prepare('SELECT count(*) n FROM agents WHERE id=?').get('denied').n, 0);
});
await check('mixed authorized and denied batch rolls back all writes', async f => {
  const result = await f.request('agents', { method: 'POST', body: ['a', 'b'].map(workspace_id => ({ id: `batch-${workspace_id}`, workspace_id, created_by: 'owner-a', name: 'batch', system_prompt: '' })) });
  assert.equal(result.status, 400); assert.equal(f.sqlite.prepare("SELECT count(*) n FROM agents WHERE id LIKE 'batch-%'").get().n, 0);
});
await check('upsert updates authorized record', async f => {
  const result = await f.request('agents', { method: 'POST', prefer: 'resolution=merge-duplicates,return=representation', query: { on_conflict: 'id' }, body: { id: 'agent-a', workspace_id: 'a', created_by: 'owner-a', name: 'updated', system_prompt: '' } });
  assert.equal(result.status, 200); assert.equal(result.data[0].name, 'updated');
});
await check('upsert cannot overwrite foreign existing id', async f => {
  const result = await f.request('agents', { method: 'POST', prefer: 'resolution=merge-duplicates,return=representation', body: { id: 'agent-b', workspace_id: 'a', created_by: 'owner-a', name: 'stolen', system_prompt: '' } });
  assert.equal(result.status, 400); assert.equal(f.sqlite.prepare('SELECT name FROM agents WHERE id=?').get('agent-b').name, 'Agent b');
});
await check('workspace editor cannot promote membership', async f => {
  const result = await f.request('workspace_members', { user: f.actor('editor-a'), method: 'POST', prefer: 'resolution=merge-duplicates,return=representation', query: { on_conflict: 'workspace_id,user_id' }, body: { id: 'm-editor', workspace_id: 'a', user_id: 'editor-a', role: 'owner' } });
  assert.equal(result.status, 400); assert.equal(f.sqlite.prepare('SELECT role FROM workspace_members WHERE id=?').get('m-editor').role, 'editor');
});
await check('unfiltered update rejected', async f => { assert.equal((await f.request('agents', { method: 'PATCH', body: { name: 'all' } })).status, 400); });
await check('unknown column and malformed expression rejected', async f => {
  assert.equal((await f.request('agents', { query: { missing: 'eq.x' } })).status, 400);
  assert.equal((await f.request('agents', { query: { or: '(name.eq.x' } })).status, 400);
});
await check('OR predicates cannot widen tenant policy', async f => {
  const result = await f.request('agents', { query: { or: '(id.eq.agent-a,id.eq.agent-b)' } }); assert.equal(result.status, 200); assert.deepEqual(result.data.map(r => r.id), ['agent-a']);
});
await check('in and null filters preserve semantics', async f => {
  const result = await f.request('agents', { query: { id: 'in.(agent-a,agent-b)', description: 'is.null' } }); assert.equal(result.status, 200); assert.equal(result.data.length, 1);
});
await check('filter values are bound, not interpolated', async f => {
  const result = await f.request('agents', { query: { name: "eq.' OR 1=1 --" } }); assert.equal(result.status, 200); assert.deepEqual(result.data, []);
});
await check('unsupported NOT fails closed', async f => { assert.equal((await f.request('agents', { query: { name: 'not.eq.Agent a' } })).status, 400); });
await check('child relations apply parent tenant policy', async f => {
  f.put('agent_tools', { id: 'tool-b', agent_id: 'agent-b', tool_type: 'web_search', tool_name: 'Fixture search', config: '{}' });
  const result = await f.request('agent_tools'); assert.equal(result.status, 200); assert.deepEqual(result.data, []);
});
await check('all schema tables have explicit read and write policies', async f => {
  for (const table of Object.keys(metadata)) {
    for (const write of [false, true]) {
      const policy = accessPolicy(table, f.actor(), write);
      assert.doesNotThrow(() => f.sqlite.prepare(`SELECT count(*) FROM "${table}" r WHERE ${policy.sql}`).get(...policy.values));
    }
  }
});
await check('unsupported structural filters fail closed', async () => {
  assert.throws(() => readFilters('agents', new URLSearchParams({ 'workspace_id;DELETE': 'eq.a' })));
});
await check('real SDK count, range, and single interoperate', async f => {
  const list = await f.sdk.from('agents').select('id,name', { count: 'exact' }).range(0, 9);
  assert.equal(list.error, null); assert.equal(list.count, 1); assert.equal(list.data[0].id, 'agent-a');
  const row = await f.sdk.from('agents').select('id').eq('id', 'agent-a').single();
  assert.equal(row.error, null); assert.equal(row.data.id, 'agent-a');
});
await check('real SDK maybeSingle empty result and joined projection interoperate', async f => {
  const missing = await f.sdk.from('agents').select('id').eq('id', 'missing').maybeSingle();
  assert.equal(missing.error, null); assert.equal(missing.data, null);
  f.put('agent_tools', { id: 'tool-a', agent_id: 'agent-a', tool_type: 'web_search', tool_name: 'Fixture search', config: '{}' });
  const row = await f.sdk.from('agents').select('id,agent_tools(tool_name)').eq('id', 'agent-a').single();
  assert.equal(row.error, null); assert.deepEqual(row.data.agent_tools, [{ tool_name: 'Fixture search' }]);
});
await check('public agent metadata does not expose private child settings', async f => {
  f.sqlite.prepare("UPDATE agents SET visibility='public' WHERE id='agent-b'").run();
  f.put('agent_tools', { id: 'tool-b', agent_id: 'agent-b', tool_type: 'web_search', tool_name: 'Private fixture', config: '{"private":"fixture"}' });
  const result = await f.sdk.from('agents').select('id,agent_tools(*)').eq('id', 'agent-b').single();
  assert.equal(result.error, null); assert.equal(result.data.id, 'agent-b'); assert.deepEqual(result.data.agent_tools, []);
  const direct = await f.request('agent_tools', { query: { agent_id: 'eq.agent-b' } }); assert.deepEqual(direct.data, []);
});
await check('reference PATCH allows same workspace, denies other workspace, allows unlink', async f => {
  f.put('agents', { id: 'agent-a2', workspace_id: 'a', created_by: 'owner-a', name: 'Second', system_prompt: '' });
  f.put('knowledge_bases', { id: 'kb-a', workspace_id: 'a', agent_id: 'agent-a', name: 'Fixture' });
  let result = await f.request('knowledge_bases', { method: 'PATCH', query: { id: 'eq.kb-a' }, body: { agent_id: 'agent-a2' } });
  assert.equal(result.status, 200); assert.equal(result.data[0].agent_id, 'agent-a2');
  result = await f.request('knowledge_bases', { method: 'PATCH', query: { id: 'eq.kb-a' }, body: { agent_id: 'agent-b' } });
  assert.equal(result.data.length, 0); assert.equal(f.sqlite.prepare("SELECT agent_id FROM knowledge_bases WHERE id='kb-a'").get().agent_id, 'agent-a2');
  result = await f.request('knowledge_bases', { method: 'PATCH', query: { id: 'eq.kb-a' }, body: { agent_id: null } });
  assert.equal(result.status, 200); assert.equal(result.data[0].agent_id, null);
});
await check('omitted identity defaults to authenticated user', async f => {
  const result = await f.request('agents', { method: 'POST', body: { workspace_id: 'a', name: 'Fixture install', system_prompt: '' } });
  assert.equal(result.status, 200); assert.equal(result.data[0].created_by, 'owner-a');
});
await check('knowledge RPC ranks embedding values and isolates knowledge bases', async f => {
  for (const workspace of ['a', 'b']) {
    f.put('knowledge_bases', { id: `kb-${workspace}`, workspace_id: workspace, name: 'Fixture' });
    f.put('knowledge_documents', { id: `doc-${workspace}`, knowledge_base_id: `kb-${workspace}`, title: 'Fixture document' });
    f.put('knowledge_chunks', { id: `chunk-${workspace}`, knowledge_base_id: `kb-${workspace}`, document_id: `doc-${workspace}`, content: 'Fixture', chunk_index: 0, embedding: '[1,0]' });
  }
  const result = await f.sdk.rpc('search_knowledge', { p_query_embedding: '[1,0]', p_knowledge_base_id: 'kb-a', p_match_count: 5, p_match_threshold: 0.5 });
  assert.equal(result.error, null); assert.equal(result.data.length, 1); assert.equal(result.data[0].id, 'chunk-a'); assert.equal(result.data[0].similarity, 1); assert.equal('embedding' in result.data[0], false);
  const foreign = await f.sdk.rpc('search_knowledge', { p_query_embedding: '[1,0]', p_knowledge_base_id: 'kb-b' });
  assert.equal(foreign.error, null); assert.deepEqual(foreign.data, []);
  const invalid = await f.sdk.rpc('search_knowledge', { p_query_embedding: '["bad"]', p_knowledge_base_id: 'kb-a' });
  assert.ok(invalid.error);
});
await check('memory RPC rejects another user and filters by agent/user', async f => {
  f.put('agent_memories', { id: 'memory-a', agent_id: 'agent-a', workspace_id: 'a', user_id: 'owner-a', content: 'Fixture', embedding: '[1,0]' });
  f.put('agent_memories', { id: 'memory-editor', agent_id: 'agent-a', workspace_id: 'a', user_id: 'editor-a', content: 'Fixture', embedding: '[1,0]' });
  const own = await f.sdk.rpc('search_agent_memories', { p_query_embedding: [1, 0], p_agent_id: 'agent-a', p_user_id: 'owner-a' });
  assert.equal(own.error, null); assert.deepEqual(own.data.map(r => r.id), ['memory-a']);
  const foreign = await f.sdk.rpc('search_agent_memories', { p_query_embedding: [1, 0], p_agent_id: 'agent-a', p_user_id: 'editor-a' });
  assert.ok(foreign.error);
});
console.log(JSON.stringify({ passed, failed, fixtureOnly: true }));
if (failed) process.exitCode = 1;

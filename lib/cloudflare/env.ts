import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

export interface AgentEnv {
  DB: D1Database;
  OUTPUTS: R2Bucket;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  API_KEY_ENCRYPTION_SECRET?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OPENAI_API_KEY?: string;
}
export async function getAgentEnv(): Promise<AgentEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as AgentEnv;
}

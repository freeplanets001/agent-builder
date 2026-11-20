import { readOutput } from '@/lib/cloudflare/outputs';
export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}){return readOutput(request,(await params).path.join('/'));}

import { getAuth } from '@/lib/cloudflare/auth';
export async function GET(request:Request):Promise<Response>{return (await getAuth()).handler(request);}
export async function POST(request:Request):Promise<Response>{return (await getAuth()).handler(request);}

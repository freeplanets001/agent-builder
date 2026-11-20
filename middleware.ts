import { NextResponse,type NextRequest } from 'next/server';
export function middleware(request:NextRequest){
  if(request.nextUrl.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method)){
    const origin=request.headers.get('origin');
    if(origin&&origin!==request.nextUrl.origin)return NextResponse.json({error:'アクセス元が許可されていません',code:'INVALID_ORIGIN'},{status:403});
    if(request.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'アクセス元が許可されていません',code:'INVALID_ORIGIN'},{status:403});
  }
  const headers=new Headers(request.headers);headers.set('x-agent-request-method',request.method);
  return NextResponse.next({request:{headers}});
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};

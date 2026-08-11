import { NextResponse, type NextRequest } from 'next/server';

/** Nom du cookie posé par POST /api/auth/login (contrat partagé). */
const AUTH_COOKIE_NAME = 'token';

export function middleware(request: NextRequest): NextResponse {
  if (request.cookies.get(AUTH_COOKIE_NAME)) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Tout sauf /login, les assets Next et les fichiers statiques.
  matcher: [
    '/((?!login|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

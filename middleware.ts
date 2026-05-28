import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "tcpa_auth";
const COOKIE_VALUE = "authenticated";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login page and auth API through
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const auth = req.cookies.get(COOKIE_NAME)?.value;
  if (auth !== COOKIE_VALUE) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

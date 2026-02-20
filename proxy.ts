import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/character", "/world", "/rpg", "/battle"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionId = request.cookies.get("session_id")?.value;

  if (isProtectedPath(pathname) && !sessionId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/auth", "/character/:path*", "/world/:path*", "/rpg/:path*", "/battle/:path*"],
};

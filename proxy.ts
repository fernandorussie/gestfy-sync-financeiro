import { type NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, COOKIE_NAME } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

function isProtected(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return false;
  }
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/clinicas") ||
    pathname.startsWith("/checkpoint") ||
    pathname.startsWith("/relatorio") ||
    pathname.startsWith("/configuracoes") ||
    pathname.startsWith("/fechamentos") ||
    (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/"))
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const appPassword = process.env.APP_PASSWORD;

  if (!token || !appPassword || !(await verifyAuthToken(token, appPassword))) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

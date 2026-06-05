import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/screens", "/playlists", "/remote-control", "/operations"];

function decodeJwt(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = atob(base64);
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("dashboard_session")?.value;
  const accessToken = request.cookies.get("dashboard_access_token")?.value;

  if (!sessionCookie || !accessToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Decode JWT and check roles for security (RBAC)
  const decoded = decodeJwt(accessToken);
  const userRole = decoded?.role ?? "";

  const isViewerRestricted = [
    "/screens/pair",
    "/playlists",
    "/remote-control",
    "/operations"
  ].some((prefix) => pathname.startsWith(prefix));

  if (userRole === "viewer" && isViewerRestricted) {
    return NextResponse.redirect(new URL("/screens?error=unauthorized_role", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/screens/:path*",
    "/playlists/:path*",
    "/remote-control/:path*",
    "/operations/:path*"
  ]
};


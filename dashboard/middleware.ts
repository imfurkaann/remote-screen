import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/screens", "/playlists", "/remote-control", "/operations", "/media", "/apps", "/settings", "/super-admin"];

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

  const decoded = accessToken ? decodeJwt(accessToken) : null;
  const isExpired = decoded?.exp ? decoded.exp * 1000 < Date.now() : true;

  if (!sessionCookie || !accessToken || isExpired) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("dashboard_session");
    response.cookies.delete("dashboard_access_token");
    return response;
  }

  // Decode JWT and check roles for security (RBAC)
  const userRole = decoded?.role ?? "";

  const isViewerRestricted = [
    "/screens/pair",
    "/playlists",
    "/remote-control",
    "/operations",
    "/media",
    "/apps",
    "/settings"
  ].some((prefix) => pathname.startsWith(prefix));

  if (userRole === "viewer" && isViewerRestricted) {
    return NextResponse.redirect(new URL("/screens?error=unauthorized_role", request.url));
  }

  if (userRole === "operator" && pathname.startsWith("/settings")) {
    return NextResponse.redirect(new URL("/screens?error=unauthorized_role", request.url));
  }

  if (userRole !== "super_admin" && pathname.startsWith("/super-admin")) {
    return NextResponse.redirect(new URL("/screens?error=unauthorized_role", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/screens/:path*",
    "/playlists/:path*",
    "/remote-control/:path*",
    "/operations/:path*",
    "/media/:path*",
    "/apps/:path*",
    "/settings/:path*",
    "/super-admin/:path*"
  ]
};


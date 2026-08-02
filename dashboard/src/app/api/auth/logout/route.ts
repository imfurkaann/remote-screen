import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { useSecureDashboardCookies } from "@/lib/dashboard-cookie";

export async function POST(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || request.nextUrl.protocol.replace(":", "") || "http";
  const loginUrl = new URL("/login", `${protocol}://${host}`);
  const response = NextResponse.redirect(loginUrl, { status: 303 });

  response.cookies.set("dashboard_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureDashboardCookies(),
    path: "/",
    maxAge: 0
  });
  response.cookies.set("dashboard_access_token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureDashboardCookies(),
    path: "/",
    maxAge: 0
  });

  return response;
}


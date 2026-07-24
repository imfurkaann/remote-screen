import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl, getDashboardAccessToken } from "../../content/_utils";

export async function GET(request: NextRequest) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/super/users${request.nextUrl.search}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch (error) {
    console.error("super/users GET proxy failed", error);
    return NextResponse.json({ error: "SUPER_PROXY_FAILED" }, { status: 500 });
  }
}

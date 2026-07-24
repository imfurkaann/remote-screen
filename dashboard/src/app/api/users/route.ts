import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl, getDashboardAccessToken } from "../content/_utils";

export async function GET(request: NextRequest) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/auth/users${request.nextUrl.search}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch (error) {
    console.error("users GET proxy failed", error);
    return NextResponse.json({ error: "USERS_PROXY_FAILED" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/auth/users${request.nextUrl.search}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch (error) {
    console.error("users POST proxy failed", error);
    return NextResponse.json({ error: "USERS_PROXY_FAILED" }, { status: 500 });
  }
}

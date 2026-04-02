import { NextResponse } from "next/server";

import { getBackendBaseUrl, getDashboardAccessToken } from "../_utils";

export async function GET() {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/content/playlists`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json({ error: "PLAYLIST_PROXY_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/content/playlists`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json({ error: "PLAYLIST_PROXY_FAILED" }, { status: 500 });
  }
}

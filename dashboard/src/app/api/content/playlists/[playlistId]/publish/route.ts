import { NextResponse } from "next/server";

import { getBackendBaseUrl, getDashboardAccessToken } from "../../../_utils";

type RouteParams = {
  params: Promise<{ playlistId: string }>;
};

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { playlistId } = await params;
    const body = await request.json();

    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/content/playlists/${playlistId}/publish`, {
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
    return NextResponse.json({ error: "PLAYLIST_PUBLISH_PROXY_FAILED" }, { status: 500 });
  }
}

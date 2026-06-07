import { NextResponse } from "next/server";

import { getBackendBaseUrl, getDashboardAccessToken } from "../../_utils";

type RouteParams = {
  params: Promise<{ playlistId: string }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { playlistId } = await params;
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/content/playlists/${playlistId}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json({ error: "PLAYLIST_PROXY_FAILED" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { playlistId } = await params;
    const body = await request.json();

    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/content/playlists/${playlistId}`, {
      method: "PUT",
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

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { playlistId } = await params;
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/content/playlists/${playlistId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` }
    });

    if (backendResponse.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json({ error: "PLAYLIST_PROXY_FAILED" }, { status: 500 });
  }
}

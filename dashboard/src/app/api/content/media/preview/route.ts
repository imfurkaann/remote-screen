import { NextResponse } from "next/server";
import { getBackendBaseUrl, getDashboardAccessToken } from "../../_utils";

/**
 * GET /api/content/media/preview?path=/uploads/media/...
 * Proxies the media file from the backend so the dashboard can render image thumbnails.
 */
export async function GET(request: Request) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mediaPath = searchParams.get("path");

    if (!mediaPath || !mediaPath.startsWith("/uploads/")) {
      return NextResponse.json({ error: "INVALID_PATH" }, { status: 400 });
    }

    const backendUrl = `${getBackendBaseUrl()}${mediaPath}`;
    const backendResponse = await fetch(backendUrl, {
      headers: { authorization: `Bearer ${token}` },
    });

    if (!backendResponse.ok) {
      return NextResponse.json({ error: "MEDIA_NOT_FOUND" }, { status: backendResponse.status });
    }

    const contentType = backendResponse.headers.get("content-type") ?? "application/octet-stream";
    const buffer = await backendResponse.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "PREVIEW_PROXY_FAILED" }, { status: 500 });
  }
}

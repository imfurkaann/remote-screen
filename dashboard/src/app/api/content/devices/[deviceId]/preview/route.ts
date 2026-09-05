import { NextResponse } from "next/server";
import { getBackendBaseUrl, getDashboardAccessToken } from "../../../_utils";

export async function GET(_request: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  try {
    const { deviceId } = await params;
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const backendResponse = await fetch(
      `${getBackendBaseUrl()}/api/v1/commands/devices/${encodeURIComponent(deviceId)}/preview`,
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store"
      }
    );
    if (!backendResponse.ok) {
      return NextResponse.json({ error: "PREVIEW_NOT_FOUND" }, { status: backendResponse.status });
    }

    return new NextResponse(await backendResponse.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": backendResponse.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return NextResponse.json({ error: "PREVIEW_FETCH_FAILED" }, { status: 500 });
  }
}

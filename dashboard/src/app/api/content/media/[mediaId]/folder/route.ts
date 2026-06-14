import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl, getDashboardAccessToken } from "../../../_utils";

type RouteContext = {
  params: Promise<{
    mediaId: string;
  }>;
};

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { mediaId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/content/media/${mediaId}/folder`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json({ error: "MEDIA_MOVE_PROXY_FAILED" }, { status: 500 });
  }
}

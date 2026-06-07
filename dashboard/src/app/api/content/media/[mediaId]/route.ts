import { NextResponse } from "next/server";
import { getBackendBaseUrl, getDashboardAccessToken } from "../../_utils";

type RouteParams = {
  params: Promise<{ mediaId: string }>;
};

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { mediaId } = await params;
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/content/media/${mediaId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` }
    });

    if (backendResponse.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json({ error: "MEDIA_DELETE_PROXY_FAILED" }, { status: 500 });
  }
}

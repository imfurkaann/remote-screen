import { NextResponse } from "next/server";
import { getBackendBaseUrl, getDashboardAccessToken } from "../../_utils";

export async function PUT(request: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  try {
    const { deviceId } = await params;
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/content/devices/${deviceId}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body),
      cache: "no-store"
    });

    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json({ error: "DEVICE_UPDATE_PROXY_FAILED" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  try {
    const { deviceId } = await params;
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/content/devices/${deviceId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store"
    });

    if (backendResponse.status === 204) {
      return new NextResponse(null, { status: 204 });
    }
    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json({ error: "DEVICE_DELETE_PROXY_FAILED" }, { status: 500 });
  }
}

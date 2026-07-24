import { NextResponse } from "next/server";

import { getBackendBaseUrl, getDashboardAccessToken } from "../../_utils";

export async function PUT(request: Request) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/content/devices/bulk`, {
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
    return NextResponse.json({ error: "DEVICE_BULK_UPDATE_PROXY_FAILED" }, { status: 500 });
  }
}
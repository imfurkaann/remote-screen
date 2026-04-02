import { NextResponse } from "next/server";

import { getBackendBaseUrl, getDashboardAccessToken } from "../../content/_utils";

export async function POST(request: Request) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const deviceId = String(body?.device_id ?? "").trim();
    if (!deviceId) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "device_id is required" }, { status: 400 });
    }

    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/commands/devices/${deviceId}/commands`, {
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
    return NextResponse.json({ error: "COMMAND_DISPATCH_PROXY_FAILED" }, { status: 500 });
  }
}

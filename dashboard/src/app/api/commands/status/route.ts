import { NextResponse } from "next/server";

import { getBackendBaseUrl, getDashboardAccessToken } from "../../content/_utils";

export async function GET(request: Request) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const deviceId = String(searchParams.get("device_id") ?? "").trim();
    const commandId = String(searchParams.get("command_id") ?? "").trim();

    if (!deviceId) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "device_id is required" }, { status: 400 });
    }

    const target = commandId
      ? `${getBackendBaseUrl()}/api/v1/commands/devices/${deviceId}/commands/${commandId}`
      : `${getBackendBaseUrl()}/api/v1/commands/devices/${deviceId}/commands`;

    const backendResponse = await fetch(target, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store"
    });

    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json({ error: "COMMAND_STATUS_PROXY_FAILED" }, { status: 500 });
  }
}

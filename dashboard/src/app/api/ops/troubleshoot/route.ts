import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getBackendBaseUrl, getDashboardAccessToken } from "../../content/_utils";

export async function GET(request: Request) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const url = new URL(request.url);
    const deviceId = url.searchParams.get("device_id")?.trim() ?? "";
    const hardwareId = url.searchParams.get("hardware_id")?.trim() ?? "";
    const commandLimit = url.searchParams.get("command_limit")?.trim() ?? "20";
    const telemetryLimit = url.searchParams.get("telemetry_limit")?.trim() ?? "50";

    if (!deviceId && !hardwareId) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "device_id or hardware_id is required" },
        { status: 400 }
      );
    }

    const correlationId = randomUUID();
    const endpoint = deviceId
      ? `${getBackendBaseUrl()}/api/v1/ops/devices/${encodeURIComponent(deviceId)}/troubleshoot`
      : `${getBackendBaseUrl()}/api/v1/ops/devices/by-hardware/${encodeURIComponent(hardwareId)}/troubleshoot`;

    const backendResponse = await fetch(
      `${endpoint}?command_limit=${encodeURIComponent(commandLimit)}&telemetry_limit=${encodeURIComponent(telemetryLimit)}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "x-correlation-id": correlationId
        },
        cache: "no-store",
        redirect: "follow"
      }
    );

    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(
      {
        ...payload,
        correlation_id: payload?.correlation_id ?? correlationId
      },
      { status: backendResponse.status }
    );
  } catch {
    return NextResponse.json({ error: "OPS_TROUBLESHOOT_PROXY_FAILED" }, { status: 500 });
  }
}

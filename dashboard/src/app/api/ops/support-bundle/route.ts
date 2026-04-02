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
    const commandLimit = url.searchParams.get("command_limit")?.trim() ?? "50";
    const telemetryLimit = url.searchParams.get("telemetry_limit")?.trim() ?? "100";
    const format = url.searchParams.get("format")?.trim() ?? "json";

    if (!deviceId && !hardwareId) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "device_id or hardware_id is required" },
        { status: 400 }
      );
    }

    const correlationId = randomUUID();
    const backendUrl = new URL(`${getBackendBaseUrl()}/api/v1/ops/support-bundle`);
    if (deviceId) {
      backendUrl.searchParams.set("device_id", deviceId);
    } else {
      backendUrl.searchParams.set("hardware_id", hardwareId);
    }
    backendUrl.searchParams.set("command_limit", commandLimit);
    backendUrl.searchParams.set("telemetry_limit", telemetryLimit);
    backendUrl.searchParams.set("format", format);

    const backendResponse = await fetch(backendUrl.toString(), {
      headers: {
        authorization: `Bearer ${token}`,
        "x-correlation-id": correlationId
      },
      cache: "no-store"
    });

    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(
      {
        ...payload,
        correlation_id: payload?.correlation_id ?? correlationId
      },
      { status: backendResponse.status }
    );
  } catch {
    return NextResponse.json({ error: "OPS_SUPPORT_BUNDLE_PROXY_FAILED" }, { status: 500 });
  }
}

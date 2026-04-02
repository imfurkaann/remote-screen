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
    const windowMinutes = url.searchParams.get("window_minutes")?.trim() ?? "15";

    const correlationId = randomUUID();
    const backendUrl = new URL(`${getBackendBaseUrl()}/api/v1/ops/alerts/evaluate`);
    backendUrl.searchParams.set("window_minutes", windowMinutes);

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
    return NextResponse.json({ error: "OPS_ALERTS_PROXY_FAILED" }, { status: 500 });
  }
}

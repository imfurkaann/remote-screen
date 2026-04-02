import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getBackendBaseUrl, getDashboardAccessToken } from "../../content/_utils";

export async function GET() {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const correlationId = randomUUID();
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/ops/metrics`, {
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
    return NextResponse.json({ error: "OPS_METRICS_PROXY_FAILED" }, { status: 500 });
  }
}

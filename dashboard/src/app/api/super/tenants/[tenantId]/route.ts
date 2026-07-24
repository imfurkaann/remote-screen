import { NextRequest, NextResponse } from "next/server";

import { getBackendBaseUrl, getDashboardAccessToken } from "../../../content/_utils";

type RouteParams = { params: Promise<{ tenantId: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const { tenantId } = await params;
    const body = await request.json().catch(() => ({}));
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/super/tenants/${tenantId}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json({ error: "SUPER_TENANT_UPDATE_PROXY_FAILED" }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from "next/server";

import { getBackendBaseUrl, getDashboardAccessToken } from "../_utils";

export async function GET(request: NextRequest) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const backendUrl = new URL(`${getBackendBaseUrl()}/api/v1/content/devices`);
    searchParams.forEach((value, key) => {
      backendUrl.searchParams.append(key, value);
    });

    const backendResponse = await fetch(backendUrl.toString(), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json({ error: "DEVICE_PROXY_FAILED" }, { status: 500 });
  }
}

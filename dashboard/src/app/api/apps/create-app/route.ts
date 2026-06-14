import { NextResponse } from "next/server";
import { getBackendBaseUrl, getDashboardAccessToken } from "../../content/_utils";

export async function POST(request: Request) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();

    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/apps/create-app`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch (err) {
    console.error("Create app proxy failed:", err);
    return NextResponse.json({ error: "APP_CREATE_PROXY_FAILED" }, { status: 500 });
  }
}

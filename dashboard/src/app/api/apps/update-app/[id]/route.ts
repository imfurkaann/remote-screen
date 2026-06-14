import { NextResponse } from "next/server";
import { getBackendBaseUrl, getDashboardAccessToken } from "../../../content/_utils";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/apps/update-app/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch (err) {
    console.error("Update app proxy failed:", err);
    return NextResponse.json({ error: "APP_UPDATE_PROXY_FAILED" }, { status: 500 });
  }
}

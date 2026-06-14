import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl, getDashboardAccessToken } from "../../content/_utils";

type RouteParams = {
  params: Promise<{
    userId: string;
  }>;
};

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { userId } = await params;
    const body = await request.json().catch(() => ({}));
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/auth/users/${userId}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch (error) {
    console.error("users PUT proxy failed", error);
    return NextResponse.json({ error: "USERS_PROXY_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { userId } = await params;
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/auth/users/${userId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` }
    });
    
    if (backendResponse.status === 204) {
      return new NextResponse(null, { status: 204 });
    }
    
    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch (error) {
    console.error("users DELETE proxy failed", error);
    return NextResponse.json({ error: "USERS_PROXY_FAILED" }, { status: 500 });
  }
}

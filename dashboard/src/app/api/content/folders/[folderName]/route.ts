import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl, getDashboardAccessToken } from "../../_utils";

type RouteContext = {
  params: Promise<{
    folderName: string;
  }>;
};

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { folderName } = await context.params;
    const body = await req.json().catch(() => ({}));
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/content/folders/${encodeURIComponent(folderName)}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json({ error: "FOLDER_RENAME_PROXY_FAILED" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { folderName } = await context.params;
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/content/folders/${encodeURIComponent(folderName)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` }
    });

    if (backendResponse.status === 204) {
      return new Response(null, { status: 204 });
    }

    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json({ error: "FOLDER_DELETE_PROXY_FAILED" }, { status: 500 });
  }
}

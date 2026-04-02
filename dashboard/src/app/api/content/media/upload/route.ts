import { NextResponse } from "next/server";

import { getBackendBaseUrl, getDashboardAccessToken } from "../../_utils";

export async function POST(request: Request) {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const incoming = await request.formData();
    const file = incoming.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const form = new FormData();
    form.append("file", file);

    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/content/media/upload`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`
      },
      body: form
    });

    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: backendResponse.status });
  } catch {
    return NextResponse.json({ error: "UPLOAD_PROXY_FAILED" }, { status: 500 });
  }
}

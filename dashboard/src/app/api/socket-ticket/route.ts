import { NextResponse } from "next/server";
import { getBackendBaseUrl, getDashboardAccessToken } from "../content/_utils";

export async function POST() {
  const accessToken = await getDashboardAccessToken();
  if (!accessToken) {
    return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }

  const publicSocketUrl = process.env.NEXT_PUBLIC_BACKEND_SOCKET_URL;
  if (process.env.NODE_ENV === "production" && !publicSocketUrl) {
    return NextResponse.json(
      { code: "SOCKET_URL_NOT_CONFIGURED" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${getBackendBaseUrl()}/api/v1/auth/socket-ticket`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: "{}",
      cache: "no-store"
    });

    if (!response.ok) {
      return NextResponse.json(
        { code: "SOCKET_TICKET_FAILED" },
        { status: response.status }
      );
    }

    const payload = (await response.json()) as { ticket: string; expires_in: number };
    const socketUrl = publicSocketUrl ?? getBackendBaseUrl();
    return NextResponse.json(
      { ...payload, socket_url: socketUrl },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ code: "BACKEND_UNAVAILABLE" }, { status: 503 });
  }
}
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const pairingCodeValue = formData.get("pairingCode");
    const pairingCode = typeof pairingCodeValue === "string" ? pairingCodeValue.trim() : "";

    if (!/^[0-9]{6}$/.test(pairingCode)) {
      return NextResponse.redirect(new URL("/screens/pair?status=error&reason=invalid_code", request.url));
    }

    const cookieStore = await cookies();
    const accessToken = cookieStore.get("dashboard_access_token")?.value;
    if (!accessToken) {
      return NextResponse.redirect(new URL("/login?redirect=/screens/pair", request.url));
    }

    const backendBaseUrl = process.env.BACKEND_BASE_URL ?? "http://localhost:4100";
    const backendResponse = await fetch(`${backendBaseUrl}/api/v1/pairing/confirm`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ pairing_code: pairingCode })
    });

    if (!backendResponse.ok) {
      const payload = (await backendResponse.json().catch(() => ({}))) as {
        code?: string;
      };
      const reason = payload.code ?? "pairing_failed";
      return NextResponse.redirect(
        new URL(`/screens/pair?status=error&reason=${encodeURIComponent(reason)}`, request.url)
      );
    }

    return NextResponse.redirect(new URL("/screens/pair?status=ok", request.url));
  } catch {
    return NextResponse.redirect(new URL("/screens/pair?status=error&reason=unexpected_error", request.url));
  }
}

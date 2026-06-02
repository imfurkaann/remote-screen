import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      pairingCode?: unknown;
    } | null;

    const pairingCode = typeof body?.pairingCode === "string" ? body.pairingCode.trim() : "";

    if (!/^[0-9]{6}$/.test(pairingCode)) {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", message: "Pairing kodu 6 haneli sayı olmalıdır." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const accessToken = cookieStore.get("dashboard_access_token")?.value;
    if (!accessToken) {
      return NextResponse.json({ code: "UNAUTHORIZED", message: "Oturum açmanız gerekiyor." }, { status: 401 });
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

    const payload = (await backendResponse.json().catch(() => ({}))) as {
      linked?: boolean;
      device_id?: string;
      code?: string;
      message?: string;
    };

    if (!backendResponse.ok) {
      return NextResponse.json(
        { code: payload.code ?? "PAIRING_FAILED", message: payload.message ?? "Pairing başarısız." },
        { status: backendResponse.status }
      );
    }

    return NextResponse.json({ linked: true, device_id: payload.device_id });
  } catch {
    return NextResponse.json({ code: "UNEXPECTED_ERROR", message: "Beklenmeyen bir hata oluştu." }, { status: 500 });
  }
}

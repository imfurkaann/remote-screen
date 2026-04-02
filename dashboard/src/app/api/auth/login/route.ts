import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const emailValue = formData.get("email");
    const passwordValue = formData.get("password");
    const redirectValue = formData.get("redirect");
    const email = typeof emailValue === "string" ? emailValue : "";
    const password = typeof passwordValue === "string" ? passwordValue : "";
    const redirect =
      typeof redirectValue === "string" && redirectValue.startsWith("/")
        ? redirectValue
        : "/screens";

    if (!email || !password) {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400 }
      );
    }

    const backendBaseUrl = process.env.BACKEND_BASE_URL ?? "http://localhost:4100";
    const backendLoginResponse = await fetch(`${backendBaseUrl}/api/v1/auth/dev-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        tenant_id: "tenant-demo",
        role: "operator"
      })
    });

    if (!backendLoginResponse.ok) {
      return NextResponse.json(
        { error: "backend auth service is unavailable" },
        { status: 502 }
      );
    }

    const backendPayload = (await backendLoginResponse.json()) as {
      access_token?: string;
    };

    if (!backendPayload.access_token) {
      return NextResponse.json(
        { error: "backend auth token is missing" },
        { status: 502 }
      );
    }

    const response = NextResponse.redirect(new URL(redirect, request.url));
    response.cookies.set("dashboard_session", "dev-session", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8
    });
    response.cookies.set("dashboard_access_token", backendPayload.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8
    });

    return response;
  } catch (error) {
    console.error("login route failed", error);

    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
}

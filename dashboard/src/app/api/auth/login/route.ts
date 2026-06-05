import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let email = "";
    let password = "";
    let redirect = "/screens";
    const isJson = contentType.includes("application/json");

    if (isJson) {
      const body = await request.json().catch(() => ({}));
      email = String(body.email ?? "").trim();
      password = String(body.password ?? "");
      redirect = String(body.redirect ?? "").startsWith("/") ? body.redirect : "/screens";
    } else {
      const formData = await request.formData().catch(() => null);
      if (formData) {
        email = String(formData.get("email") ?? "").trim();
        password = String(formData.get("password") ?? "");
        const red = formData.get("redirect");
        redirect = typeof red === "string" && red.startsWith("/") ? red : "/screens";
      }
    }

    if (!email || !password) {
      const msg = "Email ve şifre gereklidir.";
      return isJson
        ? NextResponse.json({ error: msg }, { status: 400 })
        : NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}&redirect=${encodeURIComponent(redirect)}`, request.url));
    }

    const backendBaseUrl = process.env.BACKEND_BASE_URL ?? "http://localhost:4100";
    const backendLoginResponse = await fetch(`${backendBaseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!backendLoginResponse.ok) {
      const payload = await backendLoginResponse.json().catch(() => ({}));
      const msg = payload.message ?? "Geçersiz e-posta veya şifre.";
      return isJson
        ? NextResponse.json({ error: msg }, { status: backendLoginResponse.status })
        : NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}&redirect=${encodeURIComponent(redirect)}`, request.url));
    }

    const backendPayload = (await backendLoginResponse.json()) as {
      access_token?: string;
    };

    if (!backendPayload.access_token) {
      const msg = "Sunucudan yetkilendirme anahtarı alınamadı.";
      return isJson
        ? NextResponse.json({ error: msg }, { status: 502 })
        : NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}&redirect=${encodeURIComponent(redirect)}`, request.url));
    }

    const response = isJson
      ? NextResponse.json({ success: true, redirect })
      : NextResponse.redirect(new URL(redirect, request.url));

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
    const msg = "Giriş işlemi sırasında beklenmeyen bir hata oluştu.";
    return request.headers.get("content-type")?.includes("application/json")
      ? NextResponse.json({ error: msg }, { status: 500 })
      : NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, request.url));
  }
}

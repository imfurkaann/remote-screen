import { NextResponse } from "next/server";
import { getDashboardAccessToken } from "../../content/_utils";

function decodeJwt(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = atob(base64);
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const token = await getDashboardAccessToken();
    if (!token) {
      return NextResponse.json({ role: null, email: null, tenant_name: null }, { status: 401 });
    }

    const decoded = decodeJwt(token);
    if (!decoded) {
      return NextResponse.json({ role: null, email: null, tenant_name: null }, { status: 401 });
    }

    return NextResponse.json({
      role: decoded.role || null,
      email: decoded.email || null,
      tenant_name: decoded.tenant_name || null
    });
  } catch (error) {
    console.error("Failed to fetch /api/auth/me profile", error);
    return NextResponse.json({ role: null, email: null, tenant_name: null }, { status: 500 });
  }
}

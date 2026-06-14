import type { ReactNode } from "react";
import { cookies } from "next/headers";
import SidebarNav from "@/components/SidebarNav";

type DashboardLayoutProps = {
  children: ReactNode;
};

const NAV_LINKS: Array<{ href: string; label: string; isPlaceholder?: boolean }> = [
  { href: "/screens", label: "Screens" },
  { href: "/channels", label: "Channels", isPlaceholder: true },
  { href: "/playlists", label: "Playlists" },
  { href: "/media", label: "Media" },
  { href: "/links", label: "Links", isPlaceholder: true },
  { href: "/dashboards", label: "Dashboards", isPlaceholder: true },
  { href: "/canvas", label: "Templates", isPlaceholder: true },
  { href: "/apps", label: "Apps" },
  { href: "/quick-post", label: "Quick Post", isPlaceholder: true },
  { href: "/operations", label: "Operations" },
  { href: "/settings/users", label: "Users" }
];

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

function getRoleLabel(role: string): string {
  switch (role) {
    case "tenant_owner":
      return "Owner";
    case "tenant_admin":
      return "Admin";
    case "operator":
      return "Operator";
    case "viewer":
      return "Viewer";
    default:
      return role;
  }
}

function getRoleBadgeBg(role: string): string {
  switch (role) {
    case "tenant_owner":
      return "rgba(245, 158, 11, 0.1)";
    case "tenant_admin":
      return "rgba(14, 165, 233, 0.1)";
    case "operator":
      return "rgba(16, 185, 129, 0.1)";
    case "viewer":
      return "rgba(148, 163, 184, 0.1)";
    default:
      return "rgba(148, 163, 184, 0.1)";
  }
}

function getRoleBadgeColor(role: string): string {
  switch (role) {
    case "tenant_owner":
      return "#f59e0b";
    case "tenant_admin":
      return "#0ea5e9";
    case "operator":
      return "#10b981";
    case "viewer":
      return "#94a3b8";
    default:
      return "#94a3b8";
  }
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get("dashboard_access_token")?.value;

  let email = "operator@remotescreen.dev";
  let role = "operator";

  if (token) {
    const decoded = decodeJwt(token);
    if (decoded) {
      email = decoded.email || email;
      role = decoded.role || role;
    }
  }

  const filteredLinks = NAV_LINKS.filter((link) => {
    if (role === "viewer") {
      return link.href === "/screens";
    }
    if (link.href === "/settings/users") {
      return role === "tenant_owner" || role === "tenant_admin";
    }
    if (link.href === "/operations") {
      return role === "tenant_owner";
    }
    return true;
  });

  const namePart = email.split("@")[0] || "user";
  const displayName = namePart.toLowerCase().includes("furkan") 
    ? "Furkan" 
    : namePart.charAt(0).toUpperCase() + namePart.slice(1);
  const avatarChar = displayName.charAt(0).toUpperCase();

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "var(--bg)" }}>
      {/* Sidebar Section */}
      <aside style={{
        width: 260,
        backgroundColor: "var(--sidebar-bg, #0d0e12)",
        borderRight: "1px solid var(--sidebar-border, #1f2937)",
        display: "flex",
        flexDirection: "column",
        padding: "24px 16px",
        flexShrink: 0
      }}>
        {/* Branding Logo */}
        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: "10px", paddingLeft: "8px" }}>
          <svg style={{ width: 28, height: 28, color: "var(--primary)" }} fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 2H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H5V4h14v10zm-7 4l-2 3h6l-2-3z" />
          </svg>
          <span style={{ fontSize: "18px", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.5px" }}>
            ScreenCloud
          </span>
        </div>

        {/* Space Selector Box */}
        <div style={{
          backgroundColor: "#16171d",
          border: "1px solid #272935",
          borderRadius: "6px",
          padding: "10px 14px",
          marginBottom: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "2px"
        }}>
          <span style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Space</span>
          <span style={{ fontSize: "14px", color: "#ffffff", fontWeight: 700 }}>Default</span>
        </div>

        {/* Nav Items */}
        <div style={{ flexGrow: 1, overflowY: "auto" }}>
          <SidebarNav links={filteredLinks} />
        </div>

        {/* Bottom Support & User profile */}
        <div style={{ marginTop: "auto", borderTop: "1px solid #1f2937", paddingTop: "12px" }}>
          {/* Support Link */}
          <a
            href="#"
            className="sidebar-support-link"
          >
            <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Support</span>
          </a>

          {/* User profile details */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "8px"
          }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "15px",
              flexShrink: 0
            }}>
              {avatarChar}
            </div>
            <div style={{ flexGrow: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#ffffff" }}>
                {displayName}
              </div>
              <div style={{
                fontSize: "11px",
                color: "#9ca3af",
                textOverflow: "ellipsis",
                overflow: "hidden",
                whiteSpace: "nowrap"
              }} title={email}>
                {email}
              </div>
            </div>
            <form action="/api/auth/logout" method="post" style={{ margin: 0 }}>
              <button
                type="submit"
                title="Log Out"
                className="sidebar-logout-btn"
              >
                <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flexGrow: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {children}
      </main>
    </div>
  );
}


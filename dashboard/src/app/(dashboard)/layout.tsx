import type { ReactNode } from "react";

type DashboardLayoutProps = {
  children: ReactNode;
};

const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: "/screens", label: "Screens" },
  { href: "/screens/pair", label: "Pair Device" },
  { href: "/playlists", label: "Playlists" },
  { href: "/remote-control", label: "Remote Control" },
  { href: "/operations", label: "Operations" }
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <main className="container">
      <header className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ marginTop: 0 }}>Remote Screen Operator Panel</h2>
        <nav className="row">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
          <form action="/api/auth/logout" method="post" style={{ marginLeft: "auto" }}>
            <button className="secondary" type="submit">
              Logout
            </button>
          </form>
        </nav>
      </header>
      {children}
    </main>
  );
}

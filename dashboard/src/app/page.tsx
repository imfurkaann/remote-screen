export default function HomePage() {
  return (
    <main className="container">
      <section className="card">
        <h1>Remote Screen Dashboard</h1>
        <p className="muted">
          Phase 4 foundation is live: auth, protected routes, pairing, screen status,
          playlist baseline, and remote command baseline.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <a href="/login">Open Login</a>
          <a href="/screens">Open Dashboard</a>
        </div>
      </section>
    </main>
  );
}

type LoginPageProps = {
  searchParams?: Promise<{
    redirect?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const redirectTo =
    resolvedSearchParams?.redirect && resolvedSearchParams.redirect.startsWith("/")
      ? resolvedSearchParams.redirect
      : "/screens";

  return (
    <main className="container">
      <section className="card" style={{ maxWidth: 480, margin: "48px auto" }}>
        <h2 style={{ marginTop: 0 }}>Operator Login</h2>
        <p className="muted">
          Development login for protected dashboard routes.
        </p>

        <form action="/api/auth/login" className="grid" method="post">
          <input type="hidden" name="redirect" value={redirectTo} />

          <label className="grid">
            Email
            <input defaultValue="operator@remotescreen.dev" name="email" required type="email" />
          </label>

          <label className="grid">
            Password
            <input defaultValue="operator123" name="password" required type="password" />
          </label>

          <button type="submit">Sign In</button>
        </form>
      </section>
    </main>
  );
}

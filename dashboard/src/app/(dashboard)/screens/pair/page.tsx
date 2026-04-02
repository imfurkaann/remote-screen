type PairScreenPageProps = {
  searchParams?: Promise<{
    status?: string;
    reason?: string;
  }>;
};

export default async function PairScreenPage({ searchParams }: PairScreenPageProps) {
  const params = await searchParams;
  const status = params?.status;
  const reason = params?.reason;

  return (
    <section className="card">
      <h3 style={{ marginTop: 0 }}>Pair Device</h3>
      <p className="muted">
        Enter the 6-digit pairing code shown on the Android player to link device ownership.
      </p>

      {status === "ok" ? (
        <p style={{ color: "#16a34a", marginTop: 8 }}>Device linked successfully.</p>
      ) : null}

      {status === "error" ? (
        <p style={{ color: "#dc2626", marginTop: 8 }}>
          Pairing failed{reason ? `: ${reason}` : "."}
        </p>
      ) : null}

      <form action="/api/pairing/confirm" className="grid" method="post" style={{ maxWidth: 420 }}>
        <label className="grid">
          Pairing Code
          <input
            autoComplete="off"
            inputMode="numeric"
            maxLength={6}
            name="pairingCode"
            pattern="[0-9]{6}"
            placeholder="123456"
            required
          />
        </label>
        <button type="submit">Link Device</button>
      </form>

      <small>
        API target: POST /api/v1/pairing/confirm with user JWT.
      </small>
    </section>
  );
}

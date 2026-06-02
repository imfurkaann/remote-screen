"use client";

import { useEffect, useState } from "react";

type DeviceItem = {
  id: string;
  hardware_id: string;
  name?: string | null;
  location?: string | null;
  status: string;
  last_seen_at?: string | null;
};

export default function ScreensPage() {
  const [screens, setScreens] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadScreens = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/content/devices", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to fetch device fleet status");
      }
      const payload = (await response.json()) as { devices?: DeviceItem[] };
      setScreens(payload.devices ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load screens");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadScreens();
  }, []);

  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Screen Fleet Status</h3>
        <button className="secondary" onClick={loadScreens} disabled={loading} type="button">
          {loading ? "Refreshing..." : "Refresh Status"}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Online/offline visibility baseline for operator workflows.
      </p>

      {error ? <p style={{ color: "#dc2626" }}>{error}</p> : null}

      {loading && screens.length === 0 ? (
        <p>Loading screens...</p>
      ) : screens.length === 0 ? (
        <p className="muted">No paired screens found. Go to Pair Device to link a screen.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Device ID</th>
              <th>Hardware ID</th>
              <th>Name</th>
              <th>Location</th>
              <th>Status</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {screens.map((screen) => (
              <tr key={screen.id}>
                <td>{screen.id}</td>
                <td>{screen.hardware_id}</td>
                <td>{screen.name || <em className="muted">Unnamed Screen</em>}</td>
                <td>{screen.location || <em className="muted">No Location</em>}</td>
                <td>
                  <span className={`badge ${screen.status}`}>
                    {screen.status.toUpperCase()}
                  </span>
                </td>
                <td>
                  {screen.last_seen_at
                    ? new Date(screen.last_seen_at).toLocaleString()
                    : "Never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

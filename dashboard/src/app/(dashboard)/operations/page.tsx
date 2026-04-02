"use client";

import { useEffect, useState } from "react";

type OpsMetrics = {
  tenant_id: string;
  as_of: string;
  devices: { online: number; offline: number };
  commands: { completed: number; failed: number; timeout: number; success_rate: number };
  telemetry_last_hour: { heartbeat: number; playback: number; sync: number };
};

type TroubleshootTelemetryEntry = {
  correlation_id: string | null;
  payload: unknown;
  created_at: string | null;
} | null;

type TroubleshootData = {
  tenant_id: string;
  device: {
    id: string;
    hardware_id: string;
    status: string;
    current_playlist_id: string | null;
    last_heartbeat_at: string | null;
    last_seen_at: string | null;
  };
  latest_by_kind: {
    heartbeat: TroubleshootTelemetryEntry;
    sync: TroubleshootTelemetryEntry;
    playback: TroubleshootTelemetryEntry;
    command: TroubleshootTelemetryEntry;
    error: TroubleshootTelemetryEntry;
  };
  recent_commands: Array<{
    id: string;
    command_id: string;
    command_type: string;
    status: string;
    attempts: number;
    error_message: string | null;
    sent_at: string | null;
    ack_at: string | null;
    completed_at: string | null;
    timeout_at: string | null;
    created_at: string | null;
  }>;
  recent_errors: Array<{
    id: string;
    correlation_id: string | null;
    payload: unknown;
    created_at: string | null;
  }>;
  correlation_id?: string;
};

type AlertEvaluation = {
  tenant_id: string;
  as_of: string;
  window_minutes: number;
  alerts: Array<{
    rule: string;
    severity: "ok" | "warning" | "critical";
    triggered: boolean;
    observed: number;
    threshold_warning: number;
    threshold_critical: number;
    unit: string;
  }>;
};

export default function OperationsPage() {
  const [data, setData] = useState<OpsMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [troubleshootData, setTroubleshootData] = useState<TroubleshootData | null>(null);
  const [troubleshootLoading, setTroubleshootLoading] = useState(false);
  const [troubleshootError, setTroubleshootError] = useState<string | null>(null);
  const [deviceIdInput, setDeviceIdInput] = useState("");
  const [hardwareIdInput, setHardwareIdInput] = useState("");
  const [correlationIdInput, setCorrelationIdInput] = useState("");
  const [alertsData, setAlertsData] = useState<AlertEvaluation | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleFormat, setBundleFormat] = useState("json");

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        const response = await fetch("/api/ops/metrics", { cache: "no-store" });
        if (!mounted || !response.ok) {
          return;
        }
        const payload = (await response.json()) as OpsMetrics;
        setData(payload);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, []);

  const loadTroubleshoot = async () => {
    const deviceId = deviceIdInput.trim();
    const hardwareId = hardwareIdInput.trim();

    if (!deviceId && !hardwareId) {
      setTroubleshootError("Provide device id or hardware id.");
      return;
    }

    setTroubleshootLoading(true);
    setTroubleshootError(null);

    try {
      const params = new URLSearchParams();
      if (deviceId) {
        params.set("device_id", deviceId);
      }
      if (!deviceId && hardwareId) {
        params.set("hardware_id", hardwareId);
      }
      const correlationId = correlationIdInput.trim();
      if (correlationId) {
        params.set("correlation_id", correlationId);
      }

      const response = await fetch(`/api/ops/troubleshoot?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as TroubleshootData & { message?: string; code?: string };

      if (!response.ok) {
        const message = payload?.message ?? payload?.code ?? "Troubleshoot request failed";
        setTroubleshootError(message);
        setTroubleshootData(null);
        return;
      }

      setTroubleshootData(payload);
    } finally {
      setTroubleshootLoading(false);
    }
  };

  const loadAlerts = async () => {
    setAlertsLoading(true);
    setAlertsError(null);

    try {
      const response = await fetch("/api/ops/alerts?window_minutes=15", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as AlertEvaluation & { message?: string; code?: string };

      if (!response.ok) {
        setAlertsError(payload?.message ?? payload?.code ?? "Alert evaluation failed");
        setAlertsData(null);
        return;
      }

      setAlertsData(payload);
    } finally {
      setAlertsLoading(false);
    }
  };

  const downloadSupportBundle = async () => {
    const deviceId = deviceIdInput.trim();
    const hardwareId = hardwareIdInput.trim();
    if (!deviceId && !hardwareId) {
      setTroubleshootError("Provide device id or hardware id before downloading support bundle.");
      return;
    }

    setBundleLoading(true);
    setTroubleshootError(null);

    try {
      const params = new URLSearchParams();
      if (deviceId) {
        params.set("device_id", deviceId);
      } else {
        params.set("hardware_id", hardwareId);
      }
      params.set("format", bundleFormat);

      const response = await fetch(`/api/ops/support-bundle?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const err = payload as { message?: string; code?: string };
        setTroubleshootError(err.message ?? err.code ?? "Support bundle request failed");
        return;
      }

      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeId = deviceId || hardwareId || "unknown";
      link.href = href;
      link.download = `support-bundle-${safeId}.${bundleFormat === "csv" ? "csv" : "json"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } finally {
      setBundleLoading(false);
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, []);

  return (
    <section className="card">
      <h3 style={{ marginTop: 0 }}>Operations Dashboard</h3>
      {loading ? (
        <p>Loading metrics...</p>
      ) : !data ? (
        <p>Metrics unavailable. Verify auth and backend connectivity.</p>
      ) : (
        <>
          <p>
            Tenant: <strong>{data.tenant_id}</strong>
          </p>
          <p>As of: {data.as_of}</p>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <article className="card" style={{ minWidth: 180 }}>
              <h4 style={{ marginTop: 0 }}>Devices</h4>
              <p>Online: {data.devices.online}</p>
              <p>Offline: {data.devices.offline}</p>
            </article>
            <article className="card" style={{ minWidth: 180 }}>
              <h4 style={{ marginTop: 0 }}>Command Health</h4>
              <p>Completed: {data.commands.completed}</p>
              <p>Failed: {data.commands.failed}</p>
              <p>Timeout: {data.commands.timeout}</p>
              <p>Success Rate: {(data.commands.success_rate * 100).toFixed(2)}%</p>
            </article>
            <article className="card" style={{ minWidth: 180 }}>
              <h4 style={{ marginTop: 0 }}>Telemetry (1h)</h4>
              <p>Heartbeat: {data.telemetry_last_hour.heartbeat}</p>
              <p>Playback: {data.telemetry_last_hour.playback}</p>
              <p>Sync: {data.telemetry_last_hour.sync}</p>
            </article>
          </div>
        </>
      )}

      <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid #d1d5db" }} />
      <h4 style={{ marginTop: 0 }}>Alert Threshold Evaluation</h4>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" onClick={loadAlerts} disabled={alertsLoading}>
          {alertsLoading ? "Refreshing..." : "Refresh Alerts"}
        </button>
      </div>
      {alertsError ? <p style={{ color: "#b91c1c" }}>{alertsError}</p> : null}
      {alertsData ? (
        <table className="table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Rule</th>
              <th>Severity</th>
              <th>Observed</th>
              <th>Warning</th>
              <th>Critical</th>
            </tr>
          </thead>
          <tbody>
            {alertsData.alerts.map((alert) => (
              <tr key={alert.rule}>
                <td>{alert.rule}</td>
                <td>{alert.severity}</td>
                <td>
                  {alert.observed} {alert.unit}
                </td>
                <td>
                  {alert.threshold_warning} {alert.unit}
                </td>
                <td>
                  {alert.threshold_critical} {alert.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid #d1d5db" }} />
      <h4 style={{ marginTop: 0 }}>Device Troubleshoot</h4>
      <div className="row" style={{ gap: 8 }}>
        <input
          placeholder="Device ID (Mongo _id)"
          value={deviceIdInput}
          onChange={(event) => setDeviceIdInput(event.target.value)}
          style={{ minWidth: 280 }}
        />
        <input
          placeholder="Hardware ID (optional)"
          value={hardwareIdInput}
          onChange={(event) => setHardwareIdInput(event.target.value)}
          style={{ minWidth: 240 }}
        />
        <input
          placeholder="Correlation ID (optional)"
          value={correlationIdInput}
          onChange={(event) => setCorrelationIdInput(event.target.value)}
          style={{ minWidth: 240 }}
        />
        <select value={bundleFormat} onChange={(event) => setBundleFormat(event.target.value)}>
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
        </select>
        <button type="button" onClick={loadTroubleshoot} disabled={troubleshootLoading}>
          {troubleshootLoading ? "Loading..." : "Load Troubleshoot Data"}
        </button>
        <button type="button" className="secondary" onClick={downloadSupportBundle} disabled={bundleLoading}>
          {bundleLoading ? "Preparing..." : "Download Support Bundle"}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        If both are provided, device ID is prioritized.
      </p>

      {troubleshootError ? <p style={{ color: "#b91c1c" }}>{troubleshootError}</p> : null}

      {troubleshootData ? (
        <div className="grid" style={{ marginTop: 12 }}>
          <article className="card">
            <h4 style={{ marginTop: 0 }}>Device State</h4>
            <p>
              Device: <strong>{troubleshootData.device.id}</strong>
            </p>
            <p>Hardware: {troubleshootData.device.hardware_id}</p>
            <p>Status: {troubleshootData.device.status}</p>
            <p>Current Playlist: {troubleshootData.device.current_playlist_id ?? "none"}</p>
            <p>Last Heartbeat: {troubleshootData.device.last_heartbeat_at ?? "n/a"}</p>
            <p>Last Seen: {troubleshootData.device.last_seen_at ?? "n/a"}</p>
          </article>

          <article className="card">
            <h4 style={{ marginTop: 0 }}>Latest Telemetry</h4>
            {Object.entries(troubleshootData.latest_by_kind).map(([kind, item]) => (
              <div key={kind} style={{ marginBottom: 10 }}>
                <strong>{kind}</strong>
                <p style={{ margin: "4px 0" }}>Created: {item?.created_at ?? "n/a"}</p>
                <pre style={{ margin: 0, overflowX: "auto", whiteSpace: "pre-wrap" }}>
                  {item?.payload ? JSON.stringify(item.payload, null, 2) : "No payload"}
                </pre>
              </div>
            ))}
          </article>

          <article className="card">
            <h4 style={{ marginTop: 0 }}>Recent Commands</h4>
            {troubleshootData.recent_commands.length === 0 ? (
              <p>No commands found.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Error</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {troubleshootData.recent_commands.map((command) => (
                    <tr key={command.id}>
                      <td>{command.command_type}</td>
                      <td>{command.status}</td>
                      <td>{command.attempts}</td>
                      <td>{command.error_message ?? "-"}</td>
                      <td>{command.created_at ?? "n/a"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>

          <article className="card">
            <h4 style={{ marginTop: 0 }}>Recent Errors</h4>
            {troubleshootData.recent_errors.length === 0 ? (
              <p>No error telemetry found.</p>
            ) : (
              troubleshootData.recent_errors.map((errorItem) => (
                <div key={errorItem.id} style={{ marginBottom: 12 }}>
                  <p style={{ margin: "0 0 4px" }}>
                    Time: {errorItem.created_at ?? "n/a"} | Correlation: {errorItem.correlation_id ?? "n/a"}
                  </p>
                  <pre style={{ margin: 0, overflowX: "auto", whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(errorItem.payload, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </article>
        </div>
      ) : null}
    </section>
  );
}

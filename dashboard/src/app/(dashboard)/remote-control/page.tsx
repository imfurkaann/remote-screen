"use client";

import { FormEvent, useMemo, useState } from "react";

import { REMOTE_COMMANDS } from "@/lib/mock-data";

type DeviceItem = {
  id: string;
  hardware_id: string;
  status: string;
};

type CommandStatus = {
  command_id: string;
  command_type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  screenshot_url: string | null;
  error_message: string | null;
};

async function fetchDevices(): Promise<DeviceItem[]> {
  const response = await fetch("/api/content/devices", { cache: "no-store" });
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { devices?: DeviceItem[] };
  return payload.devices ?? [];
}

export default function RemoteControlPage() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [commandType, setCommandType] = useState("");
  const [payloadText, setPayloadText] = useState('{"volume": 45}');
  const [status, setStatus] = useState<CommandStatus | null>(null);
  const [feedback, setFeedback] = useState("Ready");

  const canSubmit = useMemo(() => Boolean(deviceId && commandType), [deviceId, commandType]);

  const loadDevices = async () => {
    setLoadingDevices(true);
    const data = await fetchDevices();
    setDevices(data);
    setLoadingDevices(false);
  };

  const refreshCommandStatus = async (targetDeviceId: string, commandId: string) => {
    const response = await fetch(`/api/commands/status?device_id=${targetDeviceId}&command_id=${commandId}`, {
      cache: "no-store"
    });
    const payload = (await response.json()) as { command?: CommandStatus };
    if (response.ok && payload.command) {
      setStatus(payload.command);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("Dispatching command...");

    let payload: Record<string, unknown> = {};
    try {
      payload = payloadText.trim() ? (JSON.parse(payloadText) as Record<string, unknown>) : {};
    } catch {
      setFeedback("Payload must be valid JSON");
      return;
    }

    const commandId = crypto.randomUUID();
    const response = await fetch("/api/commands/dispatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        device_id: deviceId,
        command_id: commandId,
        command_type: commandType,
        payload,
        timeout_ms: 15000,
        max_attempts: 2
      })
    });

    const result = (await response.json()) as { command?: CommandStatus; message?: string };
    if (!response.ok) {
      setFeedback(result.message ?? "Command dispatch failed");
      return;
    }

    if (result.command) {
      setStatus(result.command);
      setFeedback(result.command.status === "completed" ? "Command completed" : "Command dispatched");
    }

    window.setTimeout(() => {
      void refreshCommandStatus(deviceId, commandId);
    }, 1200);
  };

  return (
    <section className="card grid" style={{ gap: 16 }}>
      <header>
        <h3 style={{ margin: 0 }}>Remote Command Panel</h3>
        <p className="muted" style={{ marginBottom: 0 }}>
          Send REBOOT_APP, SCREENSHOT, SET_VOLUME, FORCE_REFRESH commands and observe lifecycle status.
        </p>
      </header>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={loadDevices} disabled={loadingDevices}>
          {loadingDevices ? "Loading devices..." : "Load Devices"}
        </button>
        <small className="muted">Loaded: {devices.length}</small>
      </div>

      <form className="grid" style={{ maxWidth: 620 }} onSubmit={onSubmit}>
        <label className="grid">
          Target Screen
          <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} required>
            <option value="">Select a screen</option>
            {devices.map((screen) => (
              <option key={screen.id} value={screen.id}>
                {screen.hardware_id} ({screen.status})
              </option>
            ))}
          </select>
        </label>

        <label className="grid">
          Command Type
          <select value={commandType} onChange={(event) => setCommandType(event.target.value)} required>
            <option value="">Select a command</option>
            {REMOTE_COMMANDS.map((command) => (
              <option key={command} value={command}>
                {command}
              </option>
            ))}
          </select>
        </label>

        <label className="grid">
          Payload (JSON)
          <textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={4} />
        </label>

        <button type="submit" disabled={!canSubmit}>
          Send Command
        </button>
      </form>

      <small>{feedback}</small>

      {status ? (
        <article className="card" style={{ padding: 12 }}>
          <div>
            <strong>{status.command_type}</strong> - {status.command_id}
          </div>
          <div>Status: {status.status}</div>
          <div>
            Attempts: {status.attempts}/{status.max_attempts}
          </div>
          {status.error_message ? <div style={{ color: "#b91c1c" }}>Error: {status.error_message}</div> : null}
          {status.screenshot_url ? (
            <div>
              Screenshot: <a href={status.screenshot_url}>Open Preview</a>
            </div>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}

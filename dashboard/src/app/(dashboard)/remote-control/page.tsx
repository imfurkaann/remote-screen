"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { REMOTE_COMMANDS } from "@/lib/mock-data";
import { buildDeviceQuery } from "@/lib/device-query";
import { createClientId } from "@/lib/client-uuid";

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

const TERMINAL_STATUSES = new Set(["completed", "failed", "timeout"]);
const POLL_INTERVAL_MS = 2500;
const POLL_MAX_MS = 20_000;

async function fetchDevices(search: string): Promise<DeviceItem[]> {
  const query = buildDeviceQuery({ page: 1, limit: 100, search });
  const response = await fetch(`/api/content/devices?${query.toString()}`, { cache: "no-store" });
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
  const [deviceSearch, setDeviceSearch] = useState("");
  const [commandType, setCommandType] = useState("");
  const [payloadText, setPayloadText] = useState('{"volume": 45}');
  const [status, setStatus] = useState<CommandStatus | null>(null);
  const [feedback, setFeedback] = useState("Hazır");
  const [isPolling, setIsPolling] = useState(false);

  // Refs to allow cleanup of polling timers across renders
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number>(0);
  const pollTargetRef = useRef<{ deviceId: string; commandId: string } | null>(null);

  const canSubmit = useMemo(() => Boolean(deviceId && commandType) && !isPolling, [deviceId, commandType, isPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const loadDevices = async () => {
    setLoadingDevices(true);
    const data = await fetchDevices(deviceSearch);
    setDevices(data);
    setLoadingDevices(false);
  };

  const fetchCommandStatus = async (targetDeviceId: string, commandId: string): Promise<CommandStatus | null> => {
    try {
      const response = await fetch(`/api/commands/status?device_id=${targetDeviceId}&command_id=${commandId}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as { command?: CommandStatus };
      if (response.ok && payload.command) return payload.command;
    } catch {
      // network error — continue polling
    }
    return null;
  };

  /** Poll every POLL_INTERVAL_MS until terminal status or POLL_MAX_MS elapsed */
  const startPolling = (targetDeviceId: string, commandId: string) => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollStartRef.current = Date.now();
    pollTargetRef.current = { deviceId: targetDeviceId, commandId };
    setIsPolling(true);

    const tick = async () => {
      const target = pollTargetRef.current;
      if (!target) return;

      const result = await fetchCommandStatus(target.deviceId, target.commandId);
      if (result) {
        setStatus(result);
        const isTerminal = TERMINAL_STATUSES.has(result.status);
        const elapsed = Date.now() - pollStartRef.current;

        if (isTerminal || elapsed >= POLL_MAX_MS) {
          setIsPolling(false);
          pollTargetRef.current = null;
          setFeedback(
            isTerminal
              ? `Komut ${result.status === "completed" ? "✅ tamamlandı" : `❌ ${result.status}`}`
              : "⏱ Zaman aşımı"
          );
          return;
        }
      }

      // Schedule next tick
      pollTimerRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };

    pollTimerRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("Komut gönderiliyor...");
    setStatus(null);

    let payload: Record<string, unknown> = {};
    try {
      payload = payloadText.trim() ? (JSON.parse(payloadText) as Record<string, unknown>) : {};
    } catch {
      setFeedback("Payload geçerli JSON olmalı");
      return;
    }

    const commandId = createClientId();
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
      setFeedback(`Hata: ${result.message ?? "Komut gönderilemedi"}`);
      return;
    }

    if (result.command) {
      setStatus(result.command);
      setFeedback("Komut gönderildi — yanıt bekleniyor...");
    }

    // Begin polling until terminal status
    startPolling(deviceId, commandId);
  };

  return (
    <section className="card grid" style={{ gap: 16 }}>
      <header>
        <h3 style={{ margin: 0 }}>Uzak Komut Paneli</h3>
        <p className="muted" style={{ marginBottom: 0 }}>
          SCREEN_ON/OFF, REBOOT_APP, SCREENSHOT, SET_VOLUME, FORCE_REFRESH komutları gönderin. Durum otomatik güncellenir.
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={deviceSearch}
          onChange={(event) => setDeviceSearch(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void loadDevices(); }}
          placeholder="Ekran adı, konum veya cihaz kimliği"
          aria-label="Ekran ara"
          style={{ minWidth: 280 }}
        />
        <button type="button" onClick={loadDevices} disabled={loadingDevices}>
          {loadingDevices ? "Yükleniyor..." : "Cihazları Yükle"}
        </button>
        <small className="muted">Bulunan: {devices.length}</small>
      </div>

      <form className="grid" style={{ maxWidth: 620 }} onSubmit={onSubmit}>
        <label className="grid">
          Hedef Ekran
          <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} required>
            <option value="">Ekran seçin</option>
            {devices.map((screen) => (
              <option key={screen.id} value={screen.id}>
                {screen.hardware_id} ({screen.status})
              </option>
            ))}
          </select>
        </label>

        <label className="grid">
          Komut Tipi
          <select value={commandType} onChange={(event) => setCommandType(event.target.value)} required>
            <option value="">Komut seçin</option>
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
          {isPolling ? "Yanıt bekleniyor..." : "Komutu Gönder"}
        </button>
      </form>

      <small style={{ color: isPolling ? "#ca8a04" : undefined }}>{feedback}</small>

      {status ? (
        <article className="card" style={{ padding: 12 }}>
          <div>
            <strong>{status.command_type}</strong>
            <span className="muted" style={{ marginLeft: 8, fontSize: "0.8em" }}>
              {status.command_id}
            </span>
          </div>
          <div style={{ marginTop: 6 }}>
            Durum:{" "}
            <strong
              style={{
                color:
                  status.status === "completed"
                    ? "#16a34a"
                    : status.status === "failed" || status.status === "timeout"
                      ? "#dc2626"
                      : "#ca8a04"
              }}
            >
              {status.status.toUpperCase()}
            </strong>
          </div>
          <div>
            Deneme: {status.attempts}/{status.max_attempts}
          </div>
          {status.error_message ? <div style={{ color: "#b91c1c", marginTop: 4 }}>Hata: {status.error_message}</div> : null}
          {status.screenshot_url ? (
            <div style={{ marginTop: 4 }}>
              Ekran görüntüsü: <a href={status.screenshot_url}>Önizlemeyi Aç</a>
            </div>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
